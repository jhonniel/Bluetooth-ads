import "server-only";
import type { BluetoothStation, Prisma } from "@prisma/client";
import {
  encodeBeacon,
  type ActiveCampaignResponse,
  type StationCommandExecuteRequest,
  type StationCommandsResponse,
  type StationConfigResponse,
  type StationHeartbeatRequest,
  type StationHeartbeatResponse,
  type StationRegisterRequest,
} from "@bpa/shared";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isWellFormedStationToken, sha256Hex } from "@/lib/crypto";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { clientIp, rateLimiter } from "@/lib/rate-limit";
import { resolveCompanyId } from "@/server/domain/beacon-config";
import { nextScheduleChange, selectCampaignForStation } from "@/server/domain/campaign-rules";
import { effectiveStationStatus } from "@/server/domain/station-health";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { stationCommandRepository } from "@/server/repositories/station-command-repository";
import { stationCredentialRepository } from "@/server/repositories/station-credential-repository";
import { stationLogRepository, type StationLogEntry } from "@/server/repositories/station-log-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { settingsService } from "./settings-service";

const TOUCH_INTERVAL_MS = 60_000;

async function bluetoothConfig(station: BluetoothStation) {
  const settings = await settingsService.getSystemSettings();
  const company = resolveCompanyId({
    format: station.advertisementFormat,
    stationManufacturerId: station.manufacturerId,
    defaultManufacturerId: settings.defaultManufacturerId,
    allowTestCompanyId: env().ALLOW_TEST_COMPANY_ID,
  });
  return { settings, company };
}

export const stationAgentService = {
  /**
   * Authenticates a station by bearer token. Tokens are compared by SHA-256 hash; failures are
   * rate-limited per client IP to slow down guessing.
   */
  async authenticate(request: Request): Promise<BluetoothStation> {
    const ip = clientIp(request.headers);
    const failures = rateLimiter("station-auth-failures", 30, 60_000);
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!isWellFormedStationToken(token)) {
      failures.enforce(ip);
      throw new UnauthorizedError("Missing or invalid station credentials.");
    }
    const now = new Date();
    const credential = await stationCredentialRepository.findUsableByHash(sha256Hex(token), now);
    if (!credential) {
      failures.enforce(ip);
      throw new UnauthorizedError("Missing or invalid station credentials.");
    }
    if (!credential.lastUsedAt || now.getTime() - credential.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await stationCredentialRepository.touch(credential.id);
    }
    return credential.station;
  },

  async register(station: BluetoothStation, body: StationRegisterRequest): Promise<StationConfigResponse> {
    const now = new Date();
    const capabilities = body.capabilities ?? null;
    const problem: { status: "ERROR" | "NO_ADAPTER" | "UNSUPPORTED"; message: string } | null = !capabilities
      ? null
      : capabilities.error
        ? { status: "ERROR", message: `Bluetooth capabilities unavailable: ${capabilities.error}` }
        : !capabilities.adapterPresent
          ? { status: "NO_ADAPTER", message: "No Bluetooth adapter detected on this station." }
          : !capabilities.peripheralRoleSupported
            ? { status: "UNSUPPORTED", message: "The Bluetooth adapter does not support the peripheral role required for BLE advertising." }
            : null;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await stationRepository.update(
        station.id,
        {
          status: "CONNECTING",
          lastConnectedAt: now,
          softwareVersion: body.softwareVersion,
          hostname: body.hostname ?? null,
          osVersion: body.osVersion ?? null,
          capabilities: (capabilities ?? undefined) as Prisma.InputJsonValue | undefined,
          ...(problem ? { bluetoothStatus: problem.status, bluetoothError: problem.message } : {}),
        },
        tx,
      );
      const logs: StationLogEntry[] = [
        {
          stationId: station.id,
          type: "REGISTERED",
          message: `Agent ${body.softwareVersion} registered from ${body.hostname ?? "unknown host"}`,
          metadata: { osVersion: body.osVersion ?? null, capabilities } as Prisma.InputJsonValue,
        },
      ];
      if (problem) {
        logs.push({ stationId: station.id, type: "ADVERTISING_ERROR", level: "ERROR", message: problem.message });
      }
      await stationLogRepository.createMany(logs, tx);
      return result;
    });
    return this.config(updated);
  },

  async config(station: BluetoothStation): Promise<StationConfigResponse> {
    const { settings, company } = await bluetoothConfig(station);
    return {
      station: { code: station.stationCode, name: station.name, location: station.location },
      bluetooth: {
        advertisingEnabled: station.advertisingEnabled,
        format: station.advertisementFormat,
        companyId: company.companyId,
        beaconIdentifier: station.beaconIdentifier,
        iBeaconMajor: station.iBeaconMajor,
        measuredPower: station.measuredPower,
        txPowerDbm: station.txPowerDbm,
        advertisingIntervalMs: station.advertisingIntervalMs,
        configError: company.error,
      },
      intervals: {
        heartbeatSeconds: settings.heartbeatIntervalSeconds,
        commandPollSeconds: settings.commandPollIntervalSeconds,
        campaignSyncSeconds: settings.campaignSyncIntervalSeconds,
      },
      configRevision: station.configRevision,
      serverTime: new Date().toISOString(),
    };
  },

  async heartbeat(station: BluetoothStation, body: StationHeartbeatRequest): Promise<StationHeartbeatResponse> {
    const now = new Date();
    const settings = await settingsService.getSystemSettings();
    const previousStatus = effectiveStationStatus(station, now, settings.offlineThresholdSeconds);

    let currentCampaignId: number | null = null;
    if (body.advertising.active && body.advertising.campaignId) {
      const [campaign] = await campaignRepository.findManyByUuids([body.advertising.campaignId]);
      currentCampaignId = campaign?.id ?? null;
    }
    const nextStatus = body.shuttingDown ? "OFFLINE" : body.status;
    const wasAdvertising = station.bluetoothStatus === "ADVERTISING";
    const isAdvertising = !body.shuttingDown && body.advertising.active && body.bluetoothStatus === "ADVERTISING";

    const logs: StationLogEntry[] = [];
    if (body.shuttingDown) {
      logs.push({ stationId: station.id, type: "DISCONNECTED", message: "Agent shut down gracefully." });
    } else if (previousStatus === "OFFLINE" || previousStatus === "CONNECTING") {
      const offlineFor = station.lastHeartbeat ? Math.round((now.getTime() - station.lastHeartbeat.getTime()) / 60_000) : null;
      logs.push({
        stationId: station.id,
        type: "CONNECTED",
        message: offlineFor !== null && previousStatus === "OFFLINE" ? `Station online again after ~${offlineFor} min without heartbeat.` : "Station online.",
      });
    }
    if (!body.shuttingDown && previousStatus !== nextStatus && (nextStatus === "ERROR" || previousStatus === "ERROR")) {
      logs.push({
        stationId: station.id,
        type: "STATUS_CHANGED",
        level: nextStatus === "ERROR" ? "ERROR" : "INFO",
        message: nextStatus === "ERROR" ? `Agent reported an error: ${body.bluetoothError ?? "unknown"}` : "Agent recovered from error state.",
      });
    }
    if (isAdvertising && (!wasAdvertising || station.currentCampaignId !== currentCampaignId)) {
      logs.push({
        stationId: station.id,
        type: "ADVERTISING_STARTED",
        message: `Advertising started${body.advertising.beaconKey ? ` (campaign key ${body.advertising.beaconKey})` : ""}.`,
        metadata: { campaignId: body.advertising.campaignId ?? null },
      });
    } else if (!isAdvertising && wasAdvertising) {
      logs.push({ stationId: station.id, type: "ADVERTISING_STOPPED", message: "Advertising stopped." });
    }
    if (body.bluetoothStatus === "ERROR" && station.bluetoothStatus !== "ERROR") {
      logs.push({ stationId: station.id, type: "ADVERTISING_ERROR", level: "ERROR", message: body.bluetoothError ?? "Bluetooth advertising error." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await stationRepository.update(
        station.id,
        {
          status: nextStatus,
          bluetoothStatus: body.shuttingDown ? "STOPPED" : body.bluetoothStatus,
          bluetoothError: body.bluetoothError ?? null,
          lastHeartbeat: now,
          softwareVersion: body.softwareVersion,
          currentCampaignId: isAdvertising ? currentCampaignId : null,
          advertisingStartedAt: isAdvertising
            ? body.advertising.startedAt
              ? new Date(body.advertising.startedAt)
              : (station.advertisingStartedAt ?? now)
            : null,
        },
        tx,
      );
      await stationLogRepository.createMany(logs, tx);
      return result;
    });

    return {
      configRevision: updated.configRevision,
      pendingCommands: await stationCommandRepository.countPending(station.id, now),
      serverTime: now.toISOString(),
    };
  },

  /** Returns undelivered and delivered-but-unacknowledged commands so a crashed agent receives them again. */
  async commands(station: BluetoothStation): Promise<StationCommandsResponse> {
    const now = new Date();
    await stationCommandRepository.expireStale(station.id, now);
    const commands = await stationCommandRepository.outstanding(station.id, now);
    await stationCommandRepository.markDelivered(
      commands.filter((c) => c.status === "PENDING").map((c) => c.id),
      now,
    );
    return {
      commands: commands.map((c) => ({
        id: c.uuid,
        type: c.commandType,
        payload: (c.payload as Record<string, unknown> | null) ?? null,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
      })),
    };
  },

  async executeCommand(station: BluetoothStation, body: StationCommandExecuteRequest) {
    const command = await stationCommandRepository.findForStation(station.id, body.commandId);
    if (!command) throw new NotFoundError("Command not found.");
    if (command.status === "SUCCEEDED" || command.status === "FAILED") {
      return { id: command.uuid, status: command.status };
    }
    const executedAt = body.executedAt ? new Date(body.executedAt) : new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await stationCommandRepository.complete(command.id, body.status, body.message ?? null, executedAt, tx);
      await stationLogRepository.create(
        {
          stationId: station.id,
          type: "COMMAND_COMPLETED",
          level: body.status === "FAILED" ? "WARN" : "INFO",
          message: `${command.commandType} ${body.status === "SUCCEEDED" ? "succeeded" : "failed"}${body.message ? `: ${body.message}` : ""}`,
        },
        tx,
      );
      return updated;
    });
    return { id: result.uuid, status: result.status };
  },

  /** The single campaign this station should broadcast now, with the exact manufacturer data to publish. */
  async activeCampaign(station: BluetoothStation): Promise<ActiveCampaignResponse> {
    const now = new Date();
    await campaignRepository.syncScheduledStatuses(now);
    const campaigns = (await campaignRepository.assignedToStation(station.id)).filter((c) => c.advertisement && !c.advertisement.deletedAt);
    const base = { configRevision: station.configRevision, serverTime: now.toISOString(), nextChangeAt: nextScheduleChange(campaigns, now)?.toISOString() ?? null };

    if (!station.advertisingEnabled) {
      return { ...base, advertisingEnabled: false, campaign: null, beacon: null, reason: "Advertising is disabled for this station." };
    }
    const selected = selectCampaignForStation(campaigns, station.targetCampaignId, now);
    if (!selected) {
      return { ...base, advertisingEnabled: true, campaign: null, beacon: null, reason: "No active campaign is assigned to this station." };
    }
    const campaign = {
      id: selected.uuid,
      name: selected.name,
      beaconKey: selected.beaconKey,
      priority: selected.priority,
      startAt: selected.startAt?.toISOString() ?? null,
      endAt: selected.endAt?.toISOString() ?? null,
    };
    const { company } = await bluetoothConfig(station);
    if (company.companyId === null) {
      return { ...base, advertisingEnabled: true, campaign, beacon: null, reason: company.error };
    }
    const encoded = encodeBeacon({
      format: station.advertisementFormat,
      companyId: company.companyId,
      beaconIdentifier: station.beaconIdentifier,
      campaignKey: selected.beaconKey,
      measuredPower: station.measuredPower,
      iBeaconMajor: station.iBeaconMajor,
    });
    return {
      ...base,
      advertisingEnabled: true,
      campaign,
      beacon: {
        format: encoded.format,
        companyId: encoded.companyId,
        dataHex: encoded.dataHex,
        totalAdvertisingBytes: encoded.totalAdvertisingBytes,
        txPowerDbm: station.txPowerDbm,
      },
      reason: null,
    };
  },
};
