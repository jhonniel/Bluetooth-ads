import type { BluetoothCapabilities, StationCommandDto, StationConfigResponse } from "@bpa/shared";
import { AdvertisingController } from "./advertising-controller";
import { ApiError, isTransient, type StationApi } from "./api-client";
import type { Logger } from "./logger";
import type { BleAdvertiser } from "./native-helper";

export interface AgentOptions {
  api: StationApi;
  advertiser: BleAdvertiser;
  logger: Logger;
  version: string;
  hostname: string;
  osVersion: string;
  signal: AbortSignal;
  now?: () => number;
}

const AUTH_RETRY_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60_000;
const DEFAULT_INTERVALS = { heartbeatSeconds: 30, commandPollSeconds: 15, campaignSyncSeconds: 60 };

export function backoffDelay(attempt: number, random = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 6));
  return Math.round(base / 2 + random() * (base / 2));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Station agent lifecycle: register, then a single scheduling loop for campaign sync, heartbeats
 * and command polling. Network failures trigger exponential backoff and re-registration; a rejected
 * credential stops advertising and retries slowly until an administrator issues a new one.
 */
export class Agent {
  private readonly controller: AdvertisingController;
  private readonly now: () => number;
  private config: StationConfigResponse | null = null;
  private capabilities: BluetoothCapabilities | null = null;
  private connected = false;
  private failures = 0;
  private configRevision = -1;
  private nextSync = 0;
  private nextHeartbeat = 0;
  private nextCommandPoll = 0;
  private readonly executed = new Set<string>();
  private readonly startedAt: number;

  constructor(private readonly options: AgentOptions) {
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.controller = new AdvertisingController(options.advertiser, options.logger);
  }

  private get intervals() {
    return this.config?.intervals ?? DEFAULT_INTERVALS;
  }

  async run(): Promise<void> {
    const { signal, logger } = this.options;
    logger.info("agent starting", { version: this.options.version, hostname: this.options.hostname });
    await this.refreshCapabilities();

    while (!signal.aborted) {
      try {
        if (!this.connected) await this.connect();
        const now = this.now();
        if (now >= this.nextSync) await this.sync();
        if (now >= this.nextHeartbeat) await this.heartbeat();
        if (now >= this.nextCommandPoll) await this.pollCommands();
        this.failures = 0;
        await sleep(1000, signal);
      } catch (error) {
        await this.handleFailure(error);
      }
    }
    await this.shutdown();
  }

  private async handleFailure(error: unknown) {
    const { logger, signal } = this.options;
    this.connected = false;
    if (error instanceof ApiError && error.isAuthFailure) {
      logger.error("station credential rejected; advertising stopped until a valid credential is enrolled", { code: error.code });
      await this.controller.stop();
      await sleep(AUTH_RETRY_MS, signal);
      return;
    }
    const delay = backoffDelay(this.failures++);
    logger.warn(isTransient(error) ? "server unreachable; will retry" : "request failed; will retry", {
      error,
      retryInMs: delay,
      bluetoothStatus: this.controller.bluetoothStatus,
    });
    await sleep(delay, signal);
  }

  private async refreshCapabilities() {
    try {
      this.capabilities = await this.options.advertiser.capabilities();
    } catch (error) {
      const message = (error as Error).message;
      if (this.capabilities?.error !== message) this.options.logger.error("could not query Bluetooth capabilities", { error });
      this.capabilities = {
        adapterPresent: false,
        lowEnergySupported: false,
        peripheralRoleSupported: false,
        extendedAdvertisingSupported: false,
        radioState: "unavailable",
        error: message,
      };
    }
  }

  private async connect() {
    this.config = await this.options.api.register({
      softwareVersion: this.options.version,
      hostname: this.options.hostname,
      osVersion: this.options.osVersion,
      capabilities: this.capabilities,
    });
    this.connected = true;
    this.nextSync = 0;
    this.nextHeartbeat = 0;
    this.nextCommandPoll = 0;
    this.options.logger.info("registered with server", { station: this.config.station.code, revision: this.config.configRevision });
    if (this.config.bluetooth.configError) this.options.logger.warn("server reports configuration problem", { problem: this.config.bluetooth.configError });
  }

  /** Fetches configuration and the active campaign, then reconciles the advertiser. */
  async sync() {
    if (this.controller.hasHardwareProblem) await this.refreshCapabilities();
    this.config = await this.options.api.config();
    const active = await this.options.api.activeCampaign();
    await this.controller.apply(active, this.capabilities);
    this.configRevision = active.configRevision;

    const now = this.now();
    let next = now + this.intervals.campaignSyncSeconds * 1000;
    if (active.nextChangeAt) next = Math.min(next, Math.max(now + 1000, Date.parse(active.nextChangeAt) + 1000));
    this.nextSync = next;
    if (this.config.bluetooth.advertisingIntervalMs !== null) {
      this.options.logger.debug("advertising interval requested but not supported by the Windows publisher API; using OS default", {
        requestedMs: this.config.bluetooth.advertisingIntervalMs,
      });
    }
  }

  async heartbeat(shuttingDown = false) {
    const snapshot = this.controller.snapshot();
    const response = await this.options.api.heartbeat({
      status: this.controller.hasHardwareProblem ? "ERROR" : "ONLINE",
      ...snapshot,
      softwareVersion: this.options.version,
      uptimeSeconds: Math.round((this.now() - this.startedAt) / 1000),
      ...(shuttingDown ? { shuttingDown: true } : {}),
    });
    this.nextHeartbeat = this.now() + this.intervals.heartbeatSeconds * 1000;
    if (response.configRevision !== this.configRevision) this.nextSync = 0;
    if (response.pendingCommands > 0) this.nextCommandPoll = 0;
  }

  async pollCommands() {
    const { commands } = await this.options.api.commands();
    this.nextCommandPoll = this.now() + this.intervals.commandPollSeconds * 1000;
    let executedAny = false;
    for (const command of commands) {
      if (this.executed.has(command.id)) continue;
      await this.execute(command);
      executedAny = true;
    }
    if (executedAny) await this.heartbeat();
  }

  private async execute(command: StationCommandDto) {
    const { logger, api } = this.options;
    logger.info("executing command", { id: command.id, type: command.type });
    let status: "SUCCEEDED" | "FAILED" = "SUCCEEDED";
    let message: string;
    try {
      await this.sync();
      if (command.type === "STOP_ADVERTISING") {
        await this.controller.stop();
        message = "Advertising stopped.";
      } else {
        const snapshot = this.controller.snapshot();
        if (this.controller.hasHardwareProblem) {
          status = command.type === "START_ADVERTISING" ? "FAILED" : "SUCCEEDED";
          message = `Bluetooth ${snapshot.bluetoothStatus}: ${snapshot.bluetoothError ?? "unknown error"}`;
        } else if (snapshot.advertising.active) {
          message = `Advertising campaign key ${snapshot.advertising.beaconKey}.`;
        } else if (snapshot.bluetoothStatus === "WAITING") {
          message = "Publisher accepted the advertisement and is waiting for radio resources.";
        } else {
          message = `Not advertising: ${snapshot.bluetoothError ?? "no active campaign."}`;
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.isAuthFailure) throw error;
      status = "FAILED";
      message = (error as Error).message;
    }
    await api.executeCommand({ commandId: command.id, status, message: message.slice(0, 1000), executedAt: new Date(this.now()).toISOString() });
    this.executed.add(command.id);
    if (this.executed.size > 500) this.executed.delete(this.executed.values().next().value as string);
  }

  private async shutdown() {
    const { logger, advertiser } = this.options;
    logger.info("agent shutting down");
    await this.controller.stop();
    if (this.connected) {
      try {
        await Promise.race([this.heartbeat(true), new Promise((resolve) => setTimeout(resolve, 3000))]);
      } catch (error) {
        logger.warn("final heartbeat failed", { error });
      }
    }
    await advertiser.close();
    logger.info("agent stopped");
  }
}
