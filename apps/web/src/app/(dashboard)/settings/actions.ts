"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action-result";
import type { NotificationSettingsInput, SystemSettingsInput } from "@/lib/validation/settings";
import { requirePermission } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export async function updateNotificationSettingsAction(input: NotificationSettingsInput) {
  return runAction("settings.notifications", async () => {
    const user = await requirePermission("settings:write");
    await settingsService.updateNotificationSettings(user, input);
    revalidatePath("/settings/notifications");
  });
}

export async function updateSystemSettingsAction(input: SystemSettingsInput) {
  return runAction("settings.system", async () => {
    const user = await requirePermission("settings:write");
    await settingsService.updateSystemSettings(user, input);
    revalidatePath("/", "layout");
  });
}
