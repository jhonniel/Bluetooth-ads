import { z } from "zod";
import { ADVERTISEMENT_FORMATS, beaconIdentifierSchema, optional, optionalText, stationCodeSchema } from "@bpa/shared";
import { companyIdInputSchema } from "./settings";

export const stationCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  stationCode: optional(stationCodeSchema),
  location: optionalText(255),
  beaconIdentifier: optional(beaconIdentifierSchema),
});
export type StationCreateInput = z.input<typeof stationCreateSchema>;

export const stationDetailsSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  location: optionalText(255),
});
export type StationDetailsInput = z.input<typeof stationDetailsSchema>;

const optionalInt = (min: number, max: number) => z.union([z.number().int().min(min).max(max), z.null()]);

export const bluetoothConfigSchema = z
  .object({
    advertisingEnabled: z.boolean(),
    advertisementFormat: z.enum(ADVERTISEMENT_FORMATS),
    manufacturerId: companyIdInputSchema,
    iBeaconMajor: z.number().int().min(0).max(65535),
    measuredPower: z.number().int().min(-127).max(20),
    txPowerDbm: optionalInt(-127, 20),
    advertisingIntervalMs: optionalInt(20, 10240),
    minRssi: optionalInt(-127, 0),
    targetCampaignId: z.uuid().nullable(),
  });
export type BluetoothConfigInput = z.input<typeof bluetoothConfigSchema>;

export const credentialIssueSchema = z.object({
  expiresInDays: z.union([z.number().int().min(1).max(3650), z.null()]),
  revokeExisting: z.boolean(),
});
export type CredentialIssueInput = z.input<typeof credentialIssueSchema>;
