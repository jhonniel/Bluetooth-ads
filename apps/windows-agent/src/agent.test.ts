import { describe, expect, it, vi } from "vitest";
import type { ActiveCampaignResponse, BluetoothCapabilities, StationConfigResponse } from "@bpa/shared";
import { AdvertisingController } from "./advertising-controller";
import { Agent, backoffDelay } from "./agent";
import { ApiError, type StationApi } from "./api-client";
import type { Logger } from "./logger";
import type { BleAdvertiser, PublisherStatusEvent, StartAdvertisingRequest } from "./native-helper";

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const capable: BluetoothCapabilities = {
  adapterPresent: true,
  lowEnergySupported: true,
  peripheralRoleSupported: true,
  extendedAdvertisingSupported: false,
  radioState: "on",
};

class FakeAdvertiser implements BleAdvertiser {
  starts: StartAdvertisingRequest[] = [];
  stops = 0;
  startStatus: "Started" | "Waiting" = "Started";
  private statusListeners: ((e: PublisherStatusEvent) => void)[] = [];
  capabilities = vi.fn(async () => capable);
  async startAdvertising(request: StartAdvertisingRequest) {
    this.starts.push(request);
    return { status: this.startStatus };
  }
  async stopAdvertising() {
    this.stops++;
  }
  onStatus(listener: (e: PublisherStatusEvent) => void) {
    this.statusListeners.push(listener);
  }
  onExit() {}
  async close() {}
  emit(event: PublisherStatusEvent) {
    for (const listener of this.statusListeners) listener(event);
  }
}

const active = (overrides: Partial<ActiveCampaignResponse> = {}): ActiveCampaignResponse => ({
  advertisingEnabled: true,
  campaign: { id: "6f1c2b0e-8d6f-4b8e-9a43-1f8f6f9b2a10", name: "Welcome", beaconKey: 7, priority: 50, startAt: null, endAt: null },
  beacon: { format: "MANUFACTURER_DATA", companyId: 0xffff, dataHex: "01aabb", totalAdvertisingBytes: 27, txPowerDbm: null },
  reason: null,
  nextChangeAt: null,
  configRevision: 3,
  serverTime: new Date().toISOString(),
  ...overrides,
});

describe("AdvertisingController", () => {
  it("only reports ADVERTISING once the publisher has started", async () => {
    const fake = new FakeAdvertiser();
    fake.startStatus = "Waiting";
    const controller = new AdvertisingController(fake, silent);
    await controller.apply(active(), capable);
    expect(fake.starts).toHaveLength(1);
    expect(controller.snapshot().advertising.active).toBe(false);
    expect(controller.bluetoothStatus).toBe("WAITING");

    fake.emit({ status: "Started", error: "Success", selectedTxPowerDbm: null });
    expect(controller.snapshot()).toMatchObject({ bluetoothStatus: "ADVERTISING", advertising: { active: true, beaconKey: 7 } });
  });

  it("does not restart an unchanged broadcast and restarts on payload change", async () => {
    const fake = new FakeAdvertiser();
    const controller = new AdvertisingController(fake, silent);
    await controller.apply(active(), capable);
    await controller.apply(active(), capable);
    expect(fake.starts).toHaveLength(1);
    await controller.apply(active({ beacon: { ...active().beacon!, dataHex: "01ccdd" } }), capable);
    expect(fake.starts).toHaveLength(2);
    expect(fake.stops).toBe(1);
  });

  it("stops when the server disables advertising or there is no campaign", async () => {
    const fake = new FakeAdvertiser();
    const controller = new AdvertisingController(fake, silent);
    await controller.apply(active(), capable);
    await controller.apply(active({ advertisingEnabled: false, campaign: null, beacon: null, reason: "disabled" }), capable);
    expect(fake.stops).toBe(1);
    expect(controller.snapshot()).toMatchObject({ bluetoothStatus: "STOPPED", bluetoothError: "disabled", advertising: { active: false } });
  });

  it("refuses to advertise on unsupported hardware", async () => {
    const fake = new FakeAdvertiser();
    const controller = new AdvertisingController(fake, silent);
    await controller.apply(active(), { ...capable, peripheralRoleSupported: false });
    expect(fake.starts).toHaveLength(0);
    expect(controller.bluetoothStatus).toBe("UNSUPPORTED");
    await controller.apply(active(), { ...capable, radioState: "off" });
    expect(controller.bluetoothStatus).toBe("RADIO_OFF");
  });

  it("maps publisher aborts to honest error states", async () => {
    const fake = new FakeAdvertiser();
    const controller = new AdvertisingController(fake, silent);
    await controller.apply(active(), capable);
    fake.emit({ status: "Aborted", error: "RadioNotAvailable", selectedTxPowerDbm: null });
    expect(controller.snapshot()).toMatchObject({ bluetoothStatus: "RADIO_OFF", advertising: { active: false } });
  });

  it("does not start a campaign whose end time has passed", async () => {
    const fake = new FakeAdvertiser();
    const controller = new AdvertisingController(fake, silent);
    const ended = active();
    ended.campaign!.endAt = new Date(Date.now() - 1000).toISOString();
    await controller.apply(ended, capable);
    expect(fake.starts).toHaveLength(0);
    expect(controller.bluetoothStatus).toBe("STOPPED");
  });
});

describe("Agent", () => {
  const config: StationConfigResponse = {
    station: { code: "STN-TEST1", name: "Test", location: null },
    bluetooth: {
      advertisingEnabled: true,
      format: "MANUFACTURER_DATA",
      companyId: 0xffff,
      beaconIdentifier: "f7826da6-4fa2-4e98-8024-bc5b71e0893e",
      iBeaconMajor: 1,
      measuredPower: -59,
      txPowerDbm: null,
      advertisingIntervalMs: null,
      configError: null,
    },
    intervals: { heartbeatSeconds: 30, commandPollSeconds: 15, campaignSyncSeconds: 60 },
    configRevision: 3,
    serverTime: new Date().toISOString(),
  };

  function fakeApi() {
    const api = {
      register: vi.fn(async () => config),
      config: vi.fn(async () => config),
      heartbeat: vi.fn(async (_body: unknown) => ({ configRevision: 3, pendingCommands: 0, serverTime: new Date().toISOString() })),
      commands: vi.fn(async () => ({ commands: [] as { id: string; type: "STOP_ADVERTISING"; payload: null; createdAt: string; expiresAt: string }[] })),
      executeCommand: vi.fn(async (_body: unknown) => ({ id: "x", status: "SUCCEEDED" })),
      activeCampaign: vi.fn(async () => active()),
    };
    const typed: StationApi = api;
    return Object.assign(api, { typed });
  }

  it("registers, syncs, advertises, heartbeats and shuts down gracefully", async () => {
    const api = fakeApi();
    const fake = new FakeAdvertiser();
    const abort = new AbortController();
    api.heartbeat.mockImplementation(async () => {
      abort.abort();
      return { configRevision: 3, pendingCommands: 0, serverTime: new Date().toISOString() };
    });
    await new Agent({ api: api.typed, advertiser: fake, logger: silent, version: "1.0.0", hostname: "pc", osVersion: "win", signal: abort.signal }).run();

    expect(api.register).toHaveBeenCalledOnce();
    expect(fake.starts).toHaveLength(1);
    const first = api.heartbeat.mock.calls[0]![0];
    expect(first).toMatchObject({ status: "ONLINE", bluetoothStatus: "ADVERTISING", advertising: { active: true, beaconKey: 7 } });
    const last = api.heartbeat.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ shuttingDown: true, advertising: { active: false } });
    expect(fake.stops).toBeGreaterThan(0);
  });

  it("executes a stop command and reports the result", async () => {
    const abort = new AbortController();
    const api = fakeApi();
    api.commands.mockImplementation(async () => ({
      commands: [{ id: "8c3a0b8e-1d2f-4c5b-9a6e-7f8091a2b3c4", type: "STOP_ADVERTISING" as const, payload: null, createdAt: "", expiresAt: "" }],
    }));
    api.executeCommand.mockImplementation(async () => {
      abort.abort();
      return { id: "x", status: "SUCCEEDED" };
    });
    const fake = new FakeAdvertiser();
    await new Agent({ api: api.typed, advertiser: fake, logger: silent, version: "1.0.0", hostname: "pc", osVersion: "win", signal: abort.signal }).run();
    expect(api.executeCommand).toHaveBeenCalledWith(expect.objectContaining({ status: "SUCCEEDED", message: "Advertising stopped." }));
  });

  it("stops advertising when the credential is rejected", async () => {
    const abort = new AbortController();
    const fake = new FakeAdvertiser();
    const api = fakeApi();
    api.heartbeat.mockImplementation(async () => {
      setTimeout(() => abort.abort(), 10);
      throw new ApiError(401, "unauthorized", "revoked");
    });
    await new Agent({ api: api.typed, advertiser: fake, logger: silent, version: "1.0.0", hostname: "pc", osVersion: "win", signal: abort.signal }).run();
    expect(fake.starts).toHaveLength(1);
    expect(fake.stops).toBeGreaterThan(0);
  });

  it("backs off exponentially with a cap", () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(3, () => 1)).toBe(8000);
    expect(backoffDelay(20, () => 1)).toBe(60000);
    expect(backoffDelay(20, () => 0)).toBe(30000);
  });
});
