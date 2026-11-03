import type { Metadata } from "next";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  await requirePageUser("campaigns:write");
  const [notification, system] = await Promise.all([settingsService.getNotificationSettings(), settingsService.getSystemSettings()]);

  return (
    <>
      <PageHeader title="New campaign" description="Define content, schedule and stations. Nothing is broadcast until the campaign is activated." back={{ href: "/campaigns", label: "Campaigns" }} />
      <CampaignForm
        uuid={null}
        isRunning={false}
        organizationName={system.organizationName}
        defaults={{ cooldownMinutes: notification.defaultCooldownMinutes, maxNotificationsPerDay: notification.maxNotificationsPerDay }}
      />
    </>
  );
}
