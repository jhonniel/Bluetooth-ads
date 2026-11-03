import "server-only";
import { randomUUID } from "node:crypto";
import type { StationCommandType } from "@prisma/client";
import { encodeBeacon, validateCompanyId } from "@bpa/shared";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { generateStationToken, randomCode, sha256Hex } from "@/lib/crypto";
import { paginate, type PageRequest } from "@/lib/pagination";
import {
  bluetoothConfigSchema,
  credentialIssueSchema,
  stationCreateSchema,
  stationDetailsSchema,
  type BluetoothConfigInput,
  type CredentialIssueInput,
  type StationCreateInput,
  type StationDetailsInput,
} from "@/lib/validation/station";
import { resolveCompanyId } from "@/server/domain/beacon-config";
import { selectCampaignForStation } from "@/server/domain/campaign-rules";
import { effectiveStationStatus } from "@/server/domain/station-health";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { stationCommandRepository } from "@/server/repositories/station-command-repository";
import { stationCredentialRepository } from "@/server/repositories/station-credential-repository";
import { stationLogRepository } from "@/server/repositories/station-log-repository";
import { stationRepository, type StationWithDetails } from "@/server/repositories/station-repository";
import { auditService } from "./audit-service";
import { settingsService } from "./settings-service";
import type { CurrentUser } from "@/server/authz";

const COMMAND_TTL_MS = 10 * 60_000;

async function requireStation(code: string) {
  const station = await stationRepository.findByCode(code);
  if (!station) throw new NotFoundError("Station not found.");
  return station;
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `STN-${randomCode(6)}`;
    if (!(await stationRepository.codeExists(code))) return code;
  }
  throw new ConflictError("Could not allocate a station code. Please try again.");
}

export const stationService = {
  async list(q: string | undefined, page: PageRequest) {
    const [{ items, total }, settings] = await Promise.all([stationRepository.list({ q }, page), settingsService.getSystemSettings()]);
    const now = new Date();
    return paginate(
      items.map((station) => ({ ...station, effectiveStatus: effectiveStationStatus(station, now, settings.offlineThresholdSeconds) })),
      total,
      page,
    );
  },

  search(q: string) {
    return stationRepository.search(q.trim().slice(0, 100), 20);
  },

  async get(code: string) {
    await campaignRepository.syncScheduledStatuses();
    const station = await requireStation(code);
    const settings = await settingsService.getSystemSettings();
    return { ...station, effectiveStatus: effectiveStationStatus(station, new Date(), settings.offlineThresholdSeconds) };
  },

  /** Read-only view of what the station should broadcast right now, for the configuration screen. */
  async beaconPreview(station: StationWithDetails) {
    const settings = await settingsService.getSystemSettings();
    const company = resolveCompanyId({
      format: station.advertisementFormat,
      stationManufacturerId: station.manufacturerId,
      defaultManufacturerId: settings.defaultManufacturerId,
      allowTestCompanyId: env().ALLOW_TEST_COMPANY_ID,
    });
    const selected = selectCampaignForStation(
      station.campaigns.map((c) => c.campaign).filter((c) => c.advertisementId !== null),
      station.targetCampaignId,
      new Date(),
    );
    let encoded: ReturnType<typeof encodeBeacon> | null = null;
    let encodeError: string | null = null;
    if (selected && company.companyId !== null) {
      try {
        encoded = encodeBeacon({
          format: station.advertisementFormat,
          companyId: company.companyId,
          beaconIdentifier: station.beaconIdentifier,
          campaignKey: selected.beaconKey,
          measuredPower: station.measuredPower,
          iBeaconMajor: station.iBeaconMajor,
        });
      } catch (error) {
        encodeError = (error as Error).message;
      }
    }
    return {
      company,
      selectedCampaign: selected ? { uuid: selected.uuid, name: selected.name, beaconKey: selected.beaconKey } : null,
      encoded: encoded ? { companyId: encoded.companyId, dataHex: encoded.dataHex, totalAdvertisingBytes: encoded.totalAdvertisingBytes } : null,
      encodeError,
    };
  },

  async create(actor: CurrentUser, input: StationCreateInput) {
    const data = stationCreateSchema.parse(input);
    const settings = await settingsService.getSystemSettings();
    const stationCode = data.stationCode ?? (await generateUniqueCode());
    if (data.stationCode && (await stationRepository.codeExists(stationCode))) {
      throw new ValidationError("Station code is already in use.", { stationCode: ["Station code is already in use."] });
    }
    const beaconIdentifier = data.beaconIdentifier ?? randomUUID();
    if (await stationRepository.findByBeacon(beaconIdentifier)) {
      throw new ValidationError("Beacon identifier is already assigned.", { beaconIdentifier: ["Beacon identifier is already assigned."] });
    }

    return prisma.$transaction(async (tx) => {
      const station = await stationRepository.create(
        {
          name: data.name,
          stationCode,
          location: data.location,
          beaconIdentifier,
          advertisementFormat: settings.defaultAdvertisementFormat,
        },
        tx,
      );
      await auditService.record(actor, "station.created", { type: "station", id: stationCode }, `Registered station "${data.name}"`, undefined, tx);
      return station;
    });
  },

  async updateDetails(actor: CurrentUser, code: string, input: StationDetailsInput) {
    const data = stationDetailsSchema.parse(input);
    const station = await requireStation(code);
    await prisma.$transaction(async (tx) => {
      await stationRepository.update(station.id, { ...data, configRevision: { increment: 1 } }, tx);
      await auditService.record(actor, "station.updated", { type: "station", id: code }, `Updated station "${data.name}"`, undefined, tx);
    });
  },

  async updateBluetoothConfig(actor: CurrentUser, code: string, input: BluetoothConfigInput) {
    const data = bluetoothConfigSchema.parse(input);
    const station = await requireStation(code);

    if (data.manufacturerId !== null && data.advertisementFormat === "MANUFACTURER_DATA") {
      const problem = validateCompanyId(data.manufacturerId, data.advertisementFormat, { allowTestCompanyId: env().ALLOW_TEST_COMPANY_ID });
      if (problem) throw new ValidationError(problem, { manufacturerId: [problem] });
    }
    let targetCampaignId: number | null = null;
    if (data.targetCampaignId) {
      const assigned = station.campaigns.find((c) => c.campaign.uuid === data.targetCampaignId);
      if (!assigned) throw new ValidationError("The pinned campaign must be assigned to this station.", { targetCampaignId: ["Campaign is not assigned to this station."] });
      targetCampaignId = assigned.campaign.id;
    }

    await prisma.$transaction(async (tx) => {
      await stationRepository.update(
        station.id,
        {
          advertisingEnabled: data.advertisingEnabled,
          advertisementFormat: data.advertisementFormat,
          manufacturerId: data.manufacturerId,
          iBeaconMajor: data.iBeaconMajor,
          measuredPower: data.measuredPower,
          txPowerDbm: data.txPowerDbm,
          advertisingIntervalMs: data.advertisingIntervalMs,
          minRssi: data.minRssi,
          targetCampaignId,
          configRevision: { increment: 1 },
        },
        tx,
      );
      await stationLogRepository.create({ stationId: station.id, type: "CONFIG_UPDATED", message: `Bluetooth configuration updated by ${actor.name}` }, tx);
      await auditService.record(actor, "station.bluetooth.updated", { type: "station", id: code }, `Updated Bluetooth configuration of "${station.name}"`, {
        ...data,
      }, tx);
    });
  },

  async setCampaigns(actor: CurrentUser, code: string, campaignUuids: string[]) {
    const station = await requireStation(code);
    const unique = [...new Set(campaignUuids)];
    const campaigns = await campaignRepository.findManyByUuids(unique);
    if (campaigns.length !== unique.length) throw new ValidationError("One or more campaigns no longer exist.");
    const removedRunning = station.campaigns.filter(
      (c) => !unique.includes(c.campaign.uuid) && (c.campaign.status === "ACTIVE" || c.campaign.status === "SCHEDULED"),
    );
    for (const { campaign } of removedRunning) {
      const remaining = await campaignRepository.stationIdsFor(campaign.id);
      if (remaining.length <= 1) {
        throw new ConflictError(`"${campaign.name}" is running and this is its only station. Pause the campaign first.`);
      }
    }
    const campaignIds = campaigns.map((c) => c.id);
    await prisma.$transaction(async (tx) => {
      await stationRepository.replaceCampaigns(station.id, campaignIds, tx);
      const keepTarget = station.targetCampaignId !== null && campaignIds.includes(station.targetCampaignId);
      await stationRepository.update(station.id, { configRevision: { increment: 1 }, ...(keepTarget ? {} : { targetCampaignId: null }) }, tx);
      await auditService.record(actor, "station.campaigns.updated", { type: "station", id: code }, `Updated campaigns assigned to "${station.name}"`, {
        campaigns: unique,
      }, tx);
    });
  },

  /** Issues a credential. The plain token is returned exactly once and never persisted. */
  async issueCredential(actor: CurrentUser, code: string, input: CredentialIssueInput) {
    const data = credentialIssueSchema.parse(input);
    const station = await requireStation(code);
    const token = generateStationToken();
    const expiresAt = data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null;

    const credential = await prisma.$transaction(async (tx) => {
      const created = await stationCredentialRepository.create(
        { stationId: station.id, tokenHash: sha256Hex(token), tokenPrefix: token.slice(0, 12), expiresAt },
        tx,
      );
      if (data.revokeExisting) await stationCredentialRepository.revokeAll(station.id, created.id, tx);
      await stationLogRepository.create(
        {
          stationId: station.id,
          type: "CREDENTIAL_ISSUED",
          message: data.revokeExisting ? `Credential rotated by ${actor.name}; previous credentials revoked` : `Credential issued by ${actor.name}`,
        },
        tx,
      );
      await auditService.record(actor, data.revokeExisting ? "station.credential.rotated" : "station.credential.issued", { type: "station", id: code }, `Issued credential ${created.tokenPrefix}… for "${station.name}"`, undefined, tx);
      return created;
    });
    return { token, credentialId: credential.uuid, stationCode: station.stationCode, expiresAt: credential.expiresAt };
  },

  async revokeCredential(actor: CurrentUser, code: string, credentialUuid: string) {
    const station = await requireStation(code);
    await prisma.$transaction(async (tx) => {
      const result = await stationCredentialRepository.revoke(station.id, credentialUuid, tx);
      if (result.count === 0) throw new NotFoundError("Credential not found or already revoked.");
      await stationLogRepository.create({ stationId: station.id, type: "CREDENTIAL_REVOKED", level: "WARN", message: `Credential revoked by ${actor.name}` }, tx);
      await auditService.record(actor, "station.credential.revoked", { type: "station", id: code }, `Revoked a credential of "${station.name}"`, undefined, tx);
    });
  },

  listCredentials(stationId: number) {
    return stationCredentialRepository.listForStation(stationId);
  },

  /**
   * Queues a command for the agent to pick up on its next poll. Start/stop also change the desired
   * advertising state, so the intent survives even if the command expires before delivery.
   */
  async queueCommand(actor: CurrentUser, code: string, type: StationCommandType) {
    const station = await requireStation(code);
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      if (type !== "SYNC_CAMPAIGNS") {
        await stationCommandRepository.supersedeAdvertisingCommands(station.id, tx);
        await stationRepository.update(station.id, { advertisingEnabled: type === "START_ADVERTISING", configRevision: { increment: 1 } }, tx);
      }
      const command = await stationCommandRepository.create(
        { stationId: station.id, commandType: type, createdById: actor.id, expiresAt: new Date(now.getTime() + COMMAND_TTL_MS) },
        tx,
      );
      await stationLogRepository.create({ stationId: station.id, type: "COMMAND_QUEUED", message: `${type} queued by ${actor.name}` }, tx);
      await auditService.record(actor, "station.command.queued", { type: "station", id: code }, `Queued ${type} for "${station.name}"`, { command: command.uuid }, tx);
      return command;
    });
  },

  recentCommands(stationId: number) {
    return stationCommandRepository.recent(stationId, 20);
  },

  logs(stationId: number, kind: "all" | "advertising" | "connection") {
    return stationLogRepository.recent(stationId, kind, 50);
  },

  /** Soft delete: credentials are revoked immediately; history and analytics are kept. */
  async remove(actor: CurrentUser, code: string) {
    const station = await requireStation(code);
    await prisma.$transaction(async (tx) => {
      await stationCredentialRepository.revokeAll(station.id, undefined, tx);
      await stationRepository.softDelete(station.id, tx);
      await auditService.record(actor, "station.deleted", { type: "station", id: code }, `Removed station "${station.name}"`, undefined, tx);
    });
  },
};
