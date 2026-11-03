import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { publicIdSchema } from "@bpa/shared";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { requirePageUser } from "@/server/authz";
import { campaignService } from "@/server/services/campaign-service";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Edit campaign" };
export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ uuid: string }> }) {
  await requirePageUser("campaigns:write");
  const parsed = publicIdSchema.safeParse((await params).uuid);
  if (!parsed.success) notFound();

  const campaign = await campaignService.get(parsed.data).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  if (campaign.status === "ARCHIVED") redirect(`/campaigns/${campaign.uuid}`);
  const [notification, system] = await Promise.all([settingsService.getNotificationSettings(), settingsService.getSystemSettings()]);
  const status = effectiveCampaignStatus(campaign, new Date());

  return (
    <>
      <PageHeader title={`Edit ${campaign.name}`} back={{ href: `/campaigns/${campaign.uuid}`, label: "Campaign" }} />
      <CampaignForm
        uuid={campaign.uuid}
        isRunning={status === "ACTIVE" || status === "SCHEDULED"}
        organizationName={system.organizationName}
        defaults={{ cooldownMinutes: notification.defaultCooldownMinutes, maxNotificationsPerDay: notification.maxNotificationsPerDay }}
        initialPreview={
          campaign.advertisement
            ? { title: campaign.advertisement.title, message: campaign.advertisement.message, imageUrl: campaign.advertisement.imageUrl, ctaLabel: campaign.advertisement.ctaLabel }
            : null
        }
        initial={{
          name: campaign.name,
          description: campaign.description ?? "",
          adMode: "existing",
          advertisement: campaign.advertisement ? { value: campaign.advertisement.uuid, label: campaign.advertisement.name, description: campaign.advertisement.title } : null,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
          priority: campaign.priority,
          cooldownMinutes: campaign.cooldownMinutes,
          maxNotificationsPerDay: campaign.maxNotificationsPerDay,
          stations: campaign.stations.map(({ station }) => ({
            value: station.stationCode,
            label: station.name,
            description: [station.stationCode, station.location].filter(Boolean).join(" · "),
          })),
        }}
      />
    </>
  );
}
