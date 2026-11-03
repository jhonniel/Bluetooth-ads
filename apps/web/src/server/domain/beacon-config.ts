import { APPLE_COMPANY_ID, TEST_COMPANY_ID, validateCompanyId, type AdvertisementFormat } from "@bpa/shared";

export interface BeaconConfigInput {
  format: AdvertisementFormat;
  stationManufacturerId: number | null;
  defaultManufacturerId: number | null;
  allowTestCompanyId: boolean;
}

export interface ResolvedCompanyId {
  companyId: number | null;
  /** True when falling back to the 0xFFFF test identifier. */
  usingTestId: boolean;
  error: string | null;
}

/** Station override, then system default, then (development only) the Bluetooth SIG test identifier. */
export function resolveCompanyId(input: BeaconConfigInput): ResolvedCompanyId {
  if (input.format === "IBEACON") return { companyId: APPLE_COMPANY_ID, usingTestId: false, error: null };
  const configured = input.stationManufacturerId ?? input.defaultManufacturerId;
  if (configured === null) {
    if (input.allowTestCompanyId) return { companyId: TEST_COMPANY_ID, usingTestId: true, error: null };
    return {
      companyId: null,
      usingTestId: false,
      error: "No Bluetooth SIG company identifier is configured. Set one in System Settings or on the station.",
    };
  }
  const error = validateCompanyId(configured, input.format, { allowTestCompanyId: input.allowTestCompanyId });
  return { companyId: error ? null : configured, usingTestId: configured === TEST_COMPANY_ID, error };
}

export function formatCompanyId(value: number | null): string {
  return value === null ? "Not configured" : `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}
