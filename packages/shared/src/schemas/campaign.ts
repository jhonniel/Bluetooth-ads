import { z } from "zod";
import { landingUrlSchema, imageUrlSchema, optional, optionalText, publicIdSchema, stationCodeSchema } from "./common";

const nullableDate = z
  .union([z.date(), z.iso.datetime({ offset: true }), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

const patchDate = z
  .union([z.iso.datetime({ offset: true }), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? new Date(value) : null));

const nullableInt = (min: number, max: number) =>
  z
    .union([z.number().int().min(min).max(max), z.null()])
    .optional()
    .transform((value) => (value === undefined ? null : value));

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required.").max(120),
    description: optionalText(1000),
    advertisementId: publicIdSchema.nullish().transform((value) => value ?? null),
    startAt: nullableDate,
    endAt: nullableDate,
    priority: z.number().int().min(1).max(100),
    cooldownMinutes: nullableInt(0, 10080),
    maxNotificationsPerDay: nullableInt(1, 100),
    stationCodes: z.array(stationCodeSchema).max(500),
  })
  .refine((value) => !value.startAt || !value.endAt || value.endAt > value.startAt, {
    path: ["endAt"],
    message: "End date must be after the start date.",
  });
export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignData = z.output<typeof campaignInputSchema>;

/** PATCH accepts any subset of fields, plus a status transition. */
export const campaignPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: optionalText(1000).optional(),
  advertisementId: publicIdSchema.nullable().optional(),
  startAt: patchDate,
  endAt: patchDate,
  priority: z.number().int().min(1).max(100).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  maxNotificationsPerDay: z.number().int().min(1).max(100).nullable().optional(),
  stationCodes: z.array(stationCodeSchema).max(500).optional(),
  action: z.enum(["activate", "pause", "archive"]).optional(),
});
export type CampaignPatch = z.output<typeof campaignPatchSchema>;

export const advertisementInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  title: z.string().trim().min(1, "Notification title is required.").max(65, "Keep titles to 65 characters for notifications."),
  message: z.string().trim().min(1, "Notification message is required.").max(240, "Keep messages to 240 characters."),
  description: optionalText(2000),
  imageUrl: optional(imageUrlSchema),
  landingUrl: optional(landingUrlSchema),
  ctaLabel: optionalText(30),
});
export type AdvertisementInput = z.input<typeof advertisementInputSchema>;
export type AdvertisementData = z.output<typeof advertisementInputSchema>;
