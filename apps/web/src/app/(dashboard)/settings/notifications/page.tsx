import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";
import { can } from "@/lib/permissions";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Notification Settings" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await requirePageUser("dashboard:read");
  const [settings, system] = await Promise.all([settingsService.getNotificationSettings(), settingsService.getSystemSettings()]);
  const readOnly = !can(user.role, "settings:write");

  return (
    <>
      <PageHeader
        title="Notification Settings"
        description="Server-side frequency capping returned to the mobile app with each campaign. Only administrators can change these settings."
      />
      <NotificationSettingsForm
        readOnly={readOnly}
        timezone={system.timezone}
        initial={{
          defaultCooldownMinutes: settings.defaultCooldownMinutes,
          maxNotificationsPerDay: settings.maxNotificationsPerDay,
          quietHoursEnabled: settings.quietHoursEnabled,
          quietHoursStart: settings.quietHoursStart,
          quietHoursEnd: settings.quietHoursEnd,
          duplicatePreventionEnabled: settings.duplicatePreventionEnabled,
          duplicateWindowSeconds: settings.duplicateWindowSeconds,
          minRssi: settings.minRssi,
          notificationExpirationMinutes: settings.notificationExpirationMinutes,
        }}
      />
    </>
  );
}
