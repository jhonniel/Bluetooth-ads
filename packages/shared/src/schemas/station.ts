import { z } from "zod";
import {
  ADVERTISEMENT_FORMATS,
  AGENT_REPORTED_STATUSES,
  BLUETOOTH_STATUSES,
  STATION_COMMAND_TYPES,
} from "../enums";
import { publicIdSchema } from "./common";

/** Hardware capabilities reported by the native Windows advertiser. */
export const bluetoothCapabilitiesSchema = z.object({
  adapterPresent: z.boolean(),
  lowEnergySupported: z.boolean(),
  peripheralRoleSupported: z.boolean(),
  extendedAdvertisingSupported: z.boolean(),
  radioState: z.enum(["on", "off", "disabled", "unknown", "unavailable"]),
  adapterName: z.string().max(200).nullish(),
  error: z.string().max(500).nullish(),
});
export type BluetoothCapabilities = z.infer<typeof bluetoothCapabilitiesSchema>;

export const stationRegisterRequestSchema = z.object({
  softwareVersion: z.string().trim().min(1).max(32),
  hostname: z.string().trim().max(255).nullish(),
  osVersion: z.string().trim().max(255).nullish(),
  capabilities: bluetoothCapabilitiesSchema.nullish(),
});
export type StationRegisterRequest = z.infer<typeof stationRegisterRequestSchema>;

export const stationIntervalsSchema = z.object({
  heartbeatSeconds: z.number().int().positive(),
  commandPollSeconds: z.number().int().positive(),
  campaignSyncSeconds: z.number().int().positive(),
});

export const stationBluetoothConfigSchema = z.object({
  advertisingEnabled: z.boolean(),
  format: z.enum(ADVERTISEMENT_FORMATS),
  /** Null when no valid company identifier is configured; the agent must not advertise. */
  companyId: z.number().int().min(0).max(0xffff).nullable(),
  beaconIdentifier: z.string(),
  iBeaconMajor: z.number().int().min(0).max(0xffff),
  measuredPower: z.number().int().min(-127).max(20),
  /** Preferred transmit power in dBm, applied only when the adapter supports it. */
  txPowerDbm: z.number().int().min(-127).max(20).nullable(),
  /** Requested advertising interval. Windows does not expose interval control; reported as unsupported. */
  advertisingIntervalMs: z.number().int().min(20).max(10240).nullable(),
  configError: z.string().nullable(),
});
export type StationBluetoothConfig = z.infer<typeof stationBluetoothConfigSchema>;

export const stationConfigResponseSchema = z.object({
  station: z.object({
    code: z.string(),
    name: z.string(),
    location: z.string().nullable(),
  }),
  bluetooth: stationBluetoothConfigSchema,
  intervals: stationIntervalsSchema,
  configRevision: z.number().int(),
  serverTime: z.string(),
});
export type StationConfigResponse = z.infer<typeof stationConfigResponseSchema>;

export const stationHeartbeatRequestSchema = z.object({
  status: z.enum(AGENT_REPORTED_STATUSES),
  bluetoothStatus: z.enum(BLUETOOTH_STATUSES),
  bluetoothError: z.string().max(500).nullish(),
  advertising: z.object({
    active: z.boolean(),
    campaignId: publicIdSchema.nullish(),
    beaconKey: z.number().int().min(1).max(0xffff).nullish(),
    startedAt: z.iso.datetime({ offset: true }).nullish(),
  }),
  softwareVersion: z.string().trim().min(1).max(32),
  uptimeSeconds: z.number().int().min(0).optional(),
  /** Final heartbeat sent during graceful shutdown; the station is marked OFFLINE immediately. */
  shuttingDown: z.boolean().optional(),
});
export type StationHeartbeatRequest = z.infer<typeof stationHeartbeatRequestSchema>;

export const stationHeartbeatResponseSchema = z.object({
  configRevision: z.number().int(),
  pendingCommands: z.number().int().min(0),
  serverTime: z.string(),
});
export type StationHeartbeatResponse = z.infer<typeof stationHeartbeatResponseSchema>;

export const stationCommandSchema = z.object({
  id: z.string(),
  type: z.enum(STATION_COMMAND_TYPES),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type StationCommandDto = z.infer<typeof stationCommandSchema>;

export const stationCommandsResponseSchema = z.object({
  commands: z.array(stationCommandSchema),
});
export type StationCommandsResponse = z.infer<typeof stationCommandsResponseSchema>;

export const stationCommandExecuteRequestSchema = z.object({
  commandId: publicIdSchema,
  status: z.enum(["SUCCEEDED", "FAILED"]),
  message: z.string().max(1000).nullish(),
  executedAt: z.iso.datetime({ offset: true }).nullish(),
});
export type StationCommandExecuteRequest = z.infer<typeof stationCommandExecuteRequestSchema>;

export const activeCampaignResponseSchema = z.object({
  advertisingEnabled: z.boolean(),
  campaign: z
    .object({
      id: z.string(),
      name: z.string(),
      beaconKey: z.number().int(),
      priority: z.number().int(),
      startAt: z.string().nullable(),
      endAt: z.string().nullable(),
    })
    .nullable(),
  /** Exact manufacturer data to publish, computed by the server from the station configuration. */
  beacon: z
    .object({
      format: z.enum(ADVERTISEMENT_FORMATS),
      companyId: z.number().int().min(0).max(0xffff),
      dataHex: z.string().regex(/^(?:[0-9a-f]{2})+$/),
      totalAdvertisingBytes: z.number().int(),
      txPowerDbm: z.number().int().nullable(),
    })
    .nullable(),
  /** Why nothing should be advertised, when campaign or beacon is null. */
  reason: z.string().nullable(),
  /** When the active selection may change (campaign end or next scheduled start). */
  nextChangeAt: z.string().nullable(),
  configRevision: z.number().int(),
  serverTime: z.string(),
});
export type ActiveCampaignResponse = z.infer<typeof activeCampaignResponseSchema>;
