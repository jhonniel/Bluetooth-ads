import { z } from "zod";
import { ADVERTISEMENT_FORMATS } from "@bpa/shared";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:mm (24-hour).");

export const notificationSettingsSchema = z.object({
  defaultCooldownMinutes: z.number().int().min(0).max(10080),
  maxNotificationsPerDay: z.number().int().min(1).max(100),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: timeOfDay,
  quietHoursEnd: timeOfDay,
  duplicatePreventionEnabled: z.boolean(),
  duplicateWindowSeconds: z.number().int().min(5).max(3600),
  minRssi: z.number().int().min(-127).max(0),
  notificationExpirationMinutes: z.number().int().min(1).max(1440),
});
export type NotificationSettingsInput = z.input<typeof notificationSettingsSchema>;

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Accepts "0x1234", "1234" (hex) or empty for "not configured". */
export const companyIdInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const hex = value.toLowerCase().startsWith("0x") ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]{1,4}$/.test(hex)) {
      ctx.addIssue({ code: "custom", message: "Enter a 16-bit hexadecimal identifier, e.g. 0x0A1B." });
      return z.NEVER;
    }
    return Number.parseInt(hex, 16);
  });

export const systemSettingsSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown IANA time zone."),
  defaultManufacturerId: companyIdInputSchema,
  defaultAdvertisementFormat: z.enum(ADVERTISEMENT_FORMATS),
  heartbeatIntervalSeconds: z.number().int().min(10).max(600),
  commandPollIntervalSeconds: z.number().int().min(5).max(600),
  campaignSyncIntervalSeconds: z.number().int().min(15).max(3600),
  offlineThresholdSeconds: z.number().int().min(30).max(3600),
});
export type SystemSettingsInput = z.input<typeof systemSettingsSchema>;
