import "server-only";
import { cache } from "react";
import { env } from "@/lib/env";
import {
  notificationSettingsSchema,
  systemSettingsSchema,
  type NotificationSettingsInput,
  type SystemSettingsInput,
} from "@/lib/validation/settings";
import { ValidationError } from "@/lib/errors";
import { validateCompanyId } from "@bpa/shared";
import { prisma } from "@/lib/db";
import { settingsRepository } from "@/server/repositories/settings-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { auditService } from "./audit-service";
import type { CurrentUser } from "@/server/authz";

export const settingsService = {
  getNotificationSettings: cache(() => settingsRepository.getNotificationSettings()),
  getSystemSettings: cache(() => settingsRepository.getSystemSettings()),

  async updateNotificationSettings(actor: CurrentUser, input: NotificationSettingsInput) {
    const data = notificationSettingsSchema.parse(input);
    const settings = await settingsRepository.updateNotificationSettings(data);
    await auditService.record(actor, "settings.notifications.updated", { type: "settings", id: "notifications" }, "Updated notification settings", data);
    return settings;
  },

  async updateSystemSettings(actor: CurrentUser, input: SystemSettingsInput) {
    const data = systemSettingsSchema.parse(input);
    if (data.defaultManufacturerId !== null) {
      const problem = validateCompanyId(data.defaultManufacturerId, "MANUFACTURER_DATA", { allowTestCompanyId: env().ALLOW_TEST_COMPANY_ID });
      if (problem) throw new ValidationError(problem, { defaultManufacturerId: [problem] });
    }
    if (data.offlineThresholdSeconds < data.heartbeatIntervalSeconds * 2) {
      const message = "Offline threshold must be at least twice the heartbeat interval.";
      throw new ValidationError(message, { offlineThresholdSeconds: [message] });
    }
    return prisma.$transaction(async (tx) => {
      const before = await settingsRepository.getSystemSettings(tx);
      const settings = await settingsRepository.updateSystemSettings(data, tx);
      const beaconChanged =
        before.defaultManufacturerId !== data.defaultManufacturerId ||
        before.heartbeatIntervalSeconds !== data.heartbeatIntervalSeconds ||
        before.commandPollIntervalSeconds !== data.commandPollIntervalSeconds ||
        before.campaignSyncIntervalSeconds !== data.campaignSyncIntervalSeconds;
      if (beaconChanged) {
        // Every station's effective configuration may have changed.
        await stationRepository.bumpAllConfigRevisions(tx);
      }
      await auditService.record(actor, "settings.system.updated", { type: "settings", id: "system" }, "Updated system settings", { ...data }, tx);
      return settings;
    });
  },
};
