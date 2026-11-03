import type { AdvertisementFormat } from "./enums";

/**
 * BLE beacon protocol.
 *
 * Only a compact identifier is ever broadcast over the air. Campaign content (titles, images,
 * landing pages) is fetched by the mobile app from the API after the beacon is detected.
 *
 * Legacy BLE advertising PDUs carry at most 31 bytes of advertising data. Windows always adds a
 * 3-byte Flags AD structure, so the manufacturer-specific AD structure must fit in 28 bytes.
 *
 * MANUFACTURER_DATA (protocol "BPA v1"), company ID sent separately as little-endian by the radio:
 *   [0]      protocol version (0x01)
 *   [1..16]  station beacon UUID (16 bytes, big-endian as written)
 *   [17..18] campaign beacon key (uint16, big-endian)
 *   [19]     measured power at 1 m (int8, dBm)
 *
 * IBEACON (Apple iBeacon layout, company ID 0x004C):
 *   [0] 0x02, [1] 0x15, [2..17] proximity UUID, [18..19] major, [20..21] minor, [22] measured power
 *   The station beacon UUID is the proximity UUID, major is configurable per station and minor is
 *   the campaign beacon key. Use of the iBeacon format is subject to Apple's iBeacon licence terms.
 */

export const BPA_PROTOCOL_VERSION = 0x01;
export const LEGACY_ADVERTISING_MAX_BYTES = 31;
/** Length + type + flags value added by Windows to every legacy advertisement. */
export const WINDOWS_FLAGS_OVERHEAD_BYTES = 3;

/** Bluetooth SIG: 0xFFFF may be used for internal and interoperability testing only, never in shipping products. */
export const TEST_COMPANY_ID = 0xffff;
/** Apple Inc. company identifier, used only by the iBeacon format. */
export const APPLE_COMPANY_ID = 0x004c;

export const MIN_CAMPAIGN_BEACON_KEY = 1;
export const MAX_CAMPAIGN_BEACON_KEY = 0xffff;

export interface BeaconEncodingInput {
  format: AdvertisementFormat;
  /** Company identifier for MANUFACTURER_DATA. Ignored for IBEACON (always 0x004C). */
  companyId: number;
  /** Station beacon UUID (8-4-4-4-12 hex). */
  beaconIdentifier: string;
  /** Compact campaign identifier, 1..65535. */
  campaignKey: number;
  /** Calibrated RSSI at 1 metre in dBm (-127..20). */
  measuredPower: number;
  /** iBeacon major value, 0..65535. */
  iBeaconMajor?: number;
}

export interface EncodedBeacon {
  format: AdvertisementFormat;
  companyId: number;
  /** Manufacturer data bytes after the 2-byte company ID. */
  data: Uint8Array;
  dataHex: string;
  /** Total bytes the advertisement occupies, including the Flags structure Windows adds. */
  totalAdvertisingBytes: number;
}

export interface DecodedBeacon {
  format: AdvertisementFormat;
  beaconIdentifier: string;
  campaignKey: number;
  measuredPower: number;
  iBeaconMajor?: number;
}

export class BeaconEncodingError extends Error {
  override name = "BeaconEncodingError";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBeaconIdentifier(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function normalizeBeaconIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isBeaconIdentifier(normalized)) {
    throw new BeaconEncodingError("Beacon identifier must be a UUID (8-4-4-4-12 hexadecimal).");
  }
  return normalized;
}

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = normalizeBeaconIdentifier(uuid).replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new BeaconEncodingError("UUID must be 16 bytes.");
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new BeaconEncodingError("Invalid hexadecimal string.");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function assertInt(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BeaconEncodingError(`${label} must be an integer between ${min} and ${max}.`);
  }
}

export interface CompanyIdPolicy {
  /** Allow the Bluetooth SIG test identifier 0xFFFF (development only). */
  allowTestCompanyId: boolean;
}

/** Returns a human-readable problem with the company identifier, or null when acceptable. */
export function validateCompanyId(companyId: number, format: AdvertisementFormat, policy: CompanyIdPolicy): string | null {
  if (format === "IBEACON") return null;
  if (!Number.isInteger(companyId) || companyId < 0 || companyId > 0xffff) {
    return "Company identifier must be between 0x0000 and 0xFFFF.";
  }
  if (companyId === APPLE_COMPANY_ID) {
    return "0x004C belongs to Apple Inc. Use your own Bluetooth SIG company identifier for manufacturer data.";
  }
  if (companyId === TEST_COMPANY_ID && !policy.allowTestCompanyId) {
    return "0xFFFF is reserved for testing and must not be used in production. Configure your Bluetooth SIG-assigned company identifier.";
  }
  return null;
}

export function encodeBeacon(input: BeaconEncodingInput): EncodedBeacon {
  assertInt(input.campaignKey, MIN_CAMPAIGN_BEACON_KEY, MAX_CAMPAIGN_BEACON_KEY, "Campaign beacon key");
  assertInt(input.measuredPower, -127, 20, "Measured power");
  const uuid = uuidToBytes(input.beaconIdentifier);
  const txPower = input.measuredPower & 0xff;

  let companyId: number;
  let data: Uint8Array;

  if (input.format === "IBEACON") {
    const major = input.iBeaconMajor ?? 1;
    assertInt(major, 0, 0xffff, "iBeacon major");
    companyId = APPLE_COMPANY_ID;
    data = new Uint8Array(23);
    data[0] = 0x02;
    data[1] = 0x15;
    data.set(uuid, 2);
    data[18] = (major >> 8) & 0xff;
    data[19] = major & 0xff;
    data[20] = (input.campaignKey >> 8) & 0xff;
    data[21] = input.campaignKey & 0xff;
    data[22] = txPower;
  } else {
    assertInt(input.companyId, 0, 0xffff, "Company identifier");
    companyId = input.companyId;
    data = new Uint8Array(20);
    data[0] = BPA_PROTOCOL_VERSION;
    data.set(uuid, 1);
    data[17] = (input.campaignKey >> 8) & 0xff;
    data[18] = input.campaignKey & 0xff;
    data[19] = txPower;
  }

  // AD structure: length byte + type byte (0xFF) + 2-byte company ID + data.
  const manufacturerStructure = 1 + 1 + 2 + data.length;
  const totalAdvertisingBytes = WINDOWS_FLAGS_OVERHEAD_BYTES + manufacturerStructure;
  if (totalAdvertisingBytes > LEGACY_ADVERTISING_MAX_BYTES) {
    throw new BeaconEncodingError(
      `Advertisement is ${totalAdvertisingBytes} bytes; legacy BLE advertising allows ${LEGACY_ADVERTISING_MAX_BYTES}.`,
    );
  }

  return { format: input.format, companyId, data, dataHex: bytesToHex(data), totalAdvertisingBytes };
}

/** Reference decoder used by tests and by mobile client implementations. Returns null when not a platform beacon. */
export function decodeBeacon(companyId: number, data: Uint8Array): DecodedBeacon | null {
  const toInt8 = (b: number) => (b > 127 ? b - 256 : b);

  if (companyId === APPLE_COMPANY_ID) {
    if (data.length !== 23 || data[0] !== 0x02 || data[1] !== 0x15) return null;
    return {
      format: "IBEACON",
      beaconIdentifier: bytesToUuid(data.slice(2, 18)),
      iBeaconMajor: (data[18]! << 8) | data[19]!,
      campaignKey: (data[20]! << 8) | data[21]!,
      measuredPower: toInt8(data[22]!),
    };
  }

  if (data.length !== 20 || data[0] !== BPA_PROTOCOL_VERSION) return null;
  return {
    format: "MANUFACTURER_DATA",
    beaconIdentifier: bytesToUuid(data.slice(1, 17)),
    campaignKey: (data[17]! << 8) | data[18]!,
    measuredPower: toInt8(data[19]!),
  };
}
