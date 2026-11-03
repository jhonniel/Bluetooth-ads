import { describe, expect, it } from "vitest";
import {
  APPLE_COMPANY_ID,
  LEGACY_ADVERTISING_MAX_BYTES,
  TEST_COMPANY_ID,
  decodeBeacon,
  encodeBeacon,
  validateCompanyId,
} from "./beacon";
import { isSafeLandingUrl } from "./schemas/common";

const BEACON = "f7826da6-4fa2-4e98-8024-bc5b71e0893e";

describe("encodeBeacon", () => {
  it("encodes the BPA manufacturer format within the legacy advertising limit", () => {
    const encoded = encodeBeacon({
      format: "MANUFACTURER_DATA",
      companyId: 0x0a1b,
      beaconIdentifier: BEACON,
      campaignKey: 513,
      measuredPower: -59,
    });
    expect(encoded.companyId).toBe(0x0a1b);
    expect(encoded.data).toHaveLength(20);
    expect(encoded.dataHex.startsWith("01f7826da6")).toBe(true);
    expect(encoded.totalAdvertisingBytes).toBeLessThanOrEqual(LEGACY_ADVERTISING_MAX_BYTES);
    expect(decodeBeacon(encoded.companyId, encoded.data)).toEqual({
      format: "MANUFACTURER_DATA",
      beaconIdentifier: BEACON,
      campaignKey: 513,
      measuredPower: -59,
    });
  });

  it("encodes iBeacon with the campaign key as minor", () => {
    const encoded = encodeBeacon({
      format: "IBEACON",
      companyId: 0,
      beaconIdentifier: BEACON.toUpperCase(),
      campaignKey: 7,
      measuredPower: -65,
      iBeaconMajor: 300,
    });
    expect(encoded.companyId).toBe(APPLE_COMPANY_ID);
    expect(encoded.data).toHaveLength(23);
    expect(encoded.totalAdvertisingBytes).toBe(30);
    expect(decodeBeacon(encoded.companyId, encoded.data)).toEqual({
      format: "IBEACON",
      beaconIdentifier: BEACON,
      iBeaconMajor: 300,
      campaignKey: 7,
      measuredPower: -65,
    });
  });

  it("rejects invalid campaign keys and identifiers", () => {
    const base = { format: "MANUFACTURER_DATA" as const, companyId: 1, beaconIdentifier: BEACON, measuredPower: -59 };
    expect(() => encodeBeacon({ ...base, campaignKey: 0 })).toThrow();
    expect(() => encodeBeacon({ ...base, campaignKey: 70000 })).toThrow();
    expect(() => encodeBeacon({ ...base, campaignKey: 1, beaconIdentifier: "not-a-uuid" })).toThrow();
  });

  it("ignores data that is not a platform beacon", () => {
    expect(decodeBeacon(0x0a1b, new Uint8Array([2, 1, 2]))).toBeNull();
  });
});

describe("validateCompanyId", () => {
  it("rejects the test identifier unless explicitly allowed", () => {
    expect(validateCompanyId(TEST_COMPANY_ID, "MANUFACTURER_DATA", { allowTestCompanyId: false })).not.toBeNull();
    expect(validateCompanyId(TEST_COMPANY_ID, "MANUFACTURER_DATA", { allowTestCompanyId: true })).toBeNull();
  });

  it("rejects Apple's identifier for manufacturer data", () => {
    expect(validateCompanyId(APPLE_COMPANY_ID, "MANUFACTURER_DATA", { allowTestCompanyId: true })).not.toBeNull();
  });
});

describe("isSafeLandingUrl", () => {
  it.each([
    ["https://shop.example.com/promo?x=1", true],
    ["http://localhost:3000/promo", true],
    ["http://shop.example.com", false],
    ["javascript:alert(1)", false],
    ["https://user:pass@example.com", false],
    ["data:text/html,hi", false],
  ])("%s -> %s", (url, expected) => {
    expect(isSafeLandingUrl(url)).toBe(expected);
  });
});
