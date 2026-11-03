import { z } from "zod";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validates an outbound link shown to customers. Only https is accepted, except http for local
 * development hosts. Embedded credentials and non-web schemes (javascript:, data:, intent:) are rejected.
 */
export function isSafeLandingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return url.hostname.length > 0;
  if (url.protocol === "http:") return LOCAL_HOSTS.has(url.hostname);
  return false;
}

export const landingUrlSchema = z
  .string()
  .trim()
  .max(2048, "URL is too long.")
  .refine(isSafeLandingUrl, "Enter a valid https:// URL.");

/** Image references are either an https URL or a path to media served by this platform. */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => /^\/media\/[A-Za-z0-9._/-]+$/.test(value) || isSafeLandingUrl(value), "Enter a valid image URL.");

/** Empty strings from HTML forms become null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));
}

export function optional<T extends z.ZodType<string>>(schema: T) {
  return z
    .union([z.literal(""), schema])
    .nullish()
    .transform((value) => (value ? (value as z.output<T>) : null));
}

export const publicIdSchema = z.uuid("Invalid identifier.");
export const beaconIdentifierSchema = z
  .guid("Beacon identifier must be a UUID.")
  .transform((value) => value.toLowerCase());
export const stationCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, "Use 3-32 uppercase letters, digits or dashes.");

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
