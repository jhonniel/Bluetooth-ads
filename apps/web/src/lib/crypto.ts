import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const STATION_TOKEN_PREFIX = "bpa_st_";
const STATION_TOKEN_PATTERN = /^bpa_st_[A-Za-z0-9_-]{43}$/;

/** 256-bit random token. Shown to the administrator once; only its hash is stored. */
export function generateStationToken(): string {
  return STATION_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function isWellFormedStationToken(token: string): boolean {
  return STATION_TOKEN_PATTERN.test(token);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Keyed hash so stored device identifiers cannot be reversed or correlated without the server secret. */
export function hashDeviceToken(token: string): string {
  return createHmac("sha256", env().DEVICE_TOKEN_SECRET).update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
