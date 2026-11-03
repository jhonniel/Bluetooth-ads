import type { ActiveCampaignResponse, BluetoothCapabilities, BluetoothStatus, StationHeartbeatRequest } from "@bpa/shared";
import type { Logger } from "./logger";
import type { BleAdvertiser, PublisherStatusEvent } from "./native-helper";

interface Broadcast {
  campaignId: string;
  beaconKey: number;
  companyId: number;
  dataHex: string;
  txPowerDbm: number | null;
  endAt: Date | null;
}

const ERROR_MESSAGES: Record<string, { status: BluetoothStatus; message: string }> = {
  RadioNotAvailable: { status: "RADIO_OFF", message: "Bluetooth radio is not available or turned off." },
  DisabledByUser: { status: "RADIO_OFF", message: "Bluetooth is turned off on this PC." },
  NotSupported: { status: "UNSUPPORTED", message: "The Bluetooth adapter does not support BLE advertising." },
  TransportNotSupported: { status: "UNSUPPORTED", message: "The Bluetooth transport does not support BLE advertising." },
  ResourceInUse: { status: "ERROR", message: "The Bluetooth radio is busy (resource in use by another application)." },
  DisabledByPolicy: { status: "ERROR", message: "Bluetooth advertising is disabled by system policy." },
  ConsentRequired: { status: "ERROR", message: "Windows requires user consent for Bluetooth access." },
};

const sameBroadcast = (a: Broadcast | null, b: Broadcast | null) =>
  a !== null && b !== null && a.campaignId === b.campaignId && a.companyId === b.companyId && a.dataHex === b.dataHex && a.txPowerDbm === b.txPowerDbm;

/**
 * Reconciles the desired broadcast (from the server) with the native publisher. The reported
 * Bluetooth status only becomes ADVERTISING when Windows reports the publisher as Started.
 */
export class AdvertisingController {
  private current: Broadcast | null = null;
  private status: BluetoothStatus = "UNKNOWN";
  private error: string | null = null;
  private startedAt: Date | null = null;
  private stopping = false;
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly advertiser: BleAdvertiser,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {
    advertiser.onStatus((event) => this.onPublisherStatus(event));
    advertiser.onExit(() => {
      if (this.current) {
        this.logger.error("native helper exited while advertising");
        this.setState("ERROR", "The native Bluetooth helper exited unexpectedly; it will be restarted on the next sync.");
      }
      this.current = null;
      this.startedAt = null;
    });
  }

  /** Applies hardware capabilities. Returns false when advertising is impossible on this PC. */
  private capabilityBlock(capabilities: BluetoothCapabilities | null): { status: BluetoothStatus; message: string } | null {
    if (!capabilities) return { status: "ERROR", message: "Bluetooth capabilities could not be determined." };
    if (capabilities.error) return { status: "ERROR", message: capabilities.error };
    if (!capabilities.adapterPresent) return { status: "NO_ADAPTER", message: "No Bluetooth adapter found." };
    if (!capabilities.lowEnergySupported) return { status: "UNSUPPORTED", message: "The Bluetooth adapter does not support Bluetooth Low Energy." };
    if (!capabilities.peripheralRoleSupported) return { status: "UNSUPPORTED", message: "The Bluetooth adapter does not support the BLE peripheral role required for advertising." };
    if (capabilities.radioState !== "on") return { status: "RADIO_OFF", message: `Bluetooth radio is ${capabilities.radioState}.` };
    return null;
  }

  async apply(active: ActiveCampaignResponse, capabilities: BluetoothCapabilities | null): Promise<void> {
    const blocked = this.capabilityBlock(capabilities);
    if (blocked) {
      await this.stop();
      this.setState(blocked.status, blocked.message);
      return;
    }
    if (!active.advertisingEnabled || !active.campaign || !active.beacon) {
      await this.stop();
      this.setState("STOPPED", active.reason);
      return;
    }

    const desired: Broadcast = {
      campaignId: active.campaign.id,
      beaconKey: active.campaign.beaconKey,
      companyId: active.beacon.companyId,
      dataHex: active.beacon.dataHex,
      txPowerDbm: active.beacon.txPowerDbm,
      endAt: active.campaign.endAt ? new Date(active.campaign.endAt) : null,
    };
    if (desired.endAt && desired.endAt <= this.now()) {
      await this.stop();
      this.setState("STOPPED", "Campaign has ended.");
      return;
    }
    if (sameBroadcast(this.current, desired) && (this.status === "ADVERTISING" || this.status === "WAITING")) {
      this.current = desired;
      this.scheduleExpiry();
      return;
    }

    await this.stop();
    try {
      const result = await this.advertiser.startAdvertising({ companyId: desired.companyId, dataHex: desired.dataHex, txPowerDbm: desired.txPowerDbm });
      this.current = desired;
      this.logger.info("advertising requested", { campaignId: desired.campaignId, beaconKey: desired.beaconKey, publisherStatus: result.status });
      this.applyPublisherStatus(result.status, null);
      this.scheduleExpiry();
    } catch (error) {
      this.current = null;
      this.setState("ERROR", `Failed to start BLE advertising: ${(error as Error).message}`);
      this.logger.error("failed to start advertising", { error });
    }
  }

  async stop(): Promise<void> {
    this.clearExpiry();
    if (!this.current) return;
    this.stopping = true;
    try {
      await this.advertiser.stopAdvertising();
      this.logger.info("advertising stopped", { campaignId: this.current.campaignId });
    } catch (error) {
      this.logger.warn("stop advertising failed", { error });
    } finally {
      this.stopping = false;
      this.current = null;
      this.startedAt = null;
      this.setState("STOPPED", null);
    }
  }

  /** Stops locally when the campaign's end time passes, even if the server is unreachable. */
  private scheduleExpiry() {
    this.clearExpiry();
    if (!this.current?.endAt) return;
    const delay = Math.min(this.current.endAt.getTime() - this.now().getTime(), 2_147_000_000);
    this.expiryTimer = setTimeout(() => {
      this.logger.info("campaign end time reached; stopping advertising locally");
      void this.stop().then(() => this.setState("STOPPED", "Campaign has ended."));
    }, Math.max(0, delay));
    this.expiryTimer.unref?.();
  }

  private clearExpiry() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private onPublisherStatus(event: PublisherStatusEvent) {
    this.logger.debug("publisher status", { ...event });
    if (this.stopping) return;
    this.applyPublisherStatus(event.status, event.error);
  }

  private applyPublisherStatus(status: string, error: string | null) {
    if (status === "Started") {
      this.startedAt ??= this.now();
      this.setState("ADVERTISING", null);
    } else if (status === "Waiting" || status === "Created") {
      this.setState("WAITING", "Windows accepted the advertisement and is waiting for radio resources.");
    } else if (status === "Aborted" || (status === "Stopped" && error && error !== "Success")) {
      const mapped = (error && ERROR_MESSAGES[error]) || { status: "ERROR" as const, message: `BLE publisher aborted (${error ?? "unknown error"}).` };
      this.current = null;
      this.startedAt = null;
      this.setState(mapped.status, mapped.message);
      this.logger.error("publisher aborted", { error });
    } else if (status === "Stopped") {
      this.current = null;
      this.startedAt = null;
      this.setState("STOPPED", null);
    }
  }

  private setState(status: BluetoothStatus, error: string | null) {
    if (status !== this.status || error !== this.error) this.logger.info("bluetooth status", { status, error });
    this.status = status;
    this.error = error;
  }

  get bluetoothStatus(): BluetoothStatus {
    return this.status;
  }

  get hasHardwareProblem(): boolean {
    return ["NO_ADAPTER", "UNSUPPORTED", "RADIO_OFF", "ERROR"].includes(this.status);
  }

  snapshot(): Pick<StationHeartbeatRequest, "bluetoothStatus" | "bluetoothError" | "advertising"> {
    const advertising = this.status === "ADVERTISING" && this.current !== null;
    return {
      bluetoothStatus: this.status,
      bluetoothError: this.error,
      advertising: {
        active: advertising,
        campaignId: advertising ? this.current!.campaignId : null,
        beaconKey: advertising ? this.current!.beaconKey : null,
        startedAt: advertising && this.startedAt ? this.startedAt.toISOString() : null,
      },
    };
  }
}
