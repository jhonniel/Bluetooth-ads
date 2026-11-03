import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicIdSchema } from "@bpa/shared";
import { AdvertisementForm } from "@/components/advertisements/advertisement-form";
import { DeleteAdvertisementButton } from "@/components/advertisements/delete-advertisement-button";
import { CampaignStatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { requirePageUser } from "@/server/authz";
import { advertisementService } from "@/server/services/advertisement-service";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Advertisement" };
export const dynamic = "force-dynamic";

export default async function AdvertisementPage({ params }: { params: Promise<{ uuid: string }> }) {
  const user = await requirePageUser("dashboard:read");
  const parsed = publicIdSchema.safeParse((await params).uuid);
  if (!parsed.success) notFound();
  const ad = await advertisementService.get(parsed.data).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [system, campaigns] = await Promise.all([settingsService.getSystemSettings(), advertisementService.campaignsUsing(ad.id)]);
  const canWrite = can(user.role, "advertisements:write");
  const now = new Date();

  return (
    <>
      <PageHeader
        back={{ href: "/advertisements", label: "Advertisements" }}
        title={ad.name}
        description="Changes apply to every campaign using this advertisement the next time the mobile app fetches campaign content."
        actions={canWrite ? <DeleteAdvertisementButton uuid={ad.uuid} name={ad.name} /> : null}
      />
      <div className="space-y-6">
        <AdvertisementForm
          uuid={ad.uuid}
          readOnly={!canWrite}
          organizationName={system.organizationName}
          initial={{
            name: ad.name,
            title: ad.title,
            message: ad.message,
            description: ad.description ?? "",
            imageUrl: ad.imageUrl ?? "",
            landingUrl: ad.landingUrl ?? "",
            ctaLabel: ad.ctaLabel ?? "",
          }}
        />
        <Card>
          <CardHeader>
            <CardTitle>Used by campaigns</CardTitle>
            <CardDescription>{campaigns.length === 0 ? "Not used by any campaign yet." : `${campaigns.length} campaign(s)`}</CardDescription>
          </CardHeader>
          {campaigns.length ? (
            <CardContent>
              <ul className="divide-y">
                {campaigns.map((c) => (
                  <li key={c.uuid} className="flex items-center justify-between py-2">
                    <Link href={`/campaigns/${c.uuid}`} className="text-sm font-medium hover:underline">
                      {c.name}
                    </Link>
                    <CampaignStatusBadge status={effectiveCampaignStatus(c, now)} />
                  </li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </>
  );
}
