import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRing, History, RadioTower } from "lucide-react";
import { publicIdSchema } from "@bpa/shared";
import { NotificationPreview } from "@/components/advertisements/notification-preview";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { TrendChart } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/series";
import { EmptyState } from "@/components/common/empty-state";
import { LocalDateTime, TimeAgo } from "@/components/common/misc";
import { CampaignStatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotFoundError } from "@/lib/errors";
import { formatBucketLabel, formatNumber, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { requirePageUser } from "@/server/authz";
import { auditRepository } from "@/server/repositories/audit-repository";
import { analyticsService } from "@/server/services/analytics-service";
import { campaignService } from "@/server/services/campaign-service";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ uuid: string }> }) {
  const user = await requirePageUser("dashboard:read");
  const parsed = publicIdSchema.safeParse((await params).uuid);
  if (!parsed.success) notFound();

  const campaign = await campaignService.get(parsed.data).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [notification, system, report, history] = await Promise.all([
    settingsService.getNotificationSettings(),
    settingsService.getSystemSettings(),
    analyticsService.report({ campaign: campaign.uuid }),
    auditRepository.forEntity("campaign", campaign.uuid, 15),
  ]);
  const status = effectiveCampaignStatus(campaign, new Date());
  const ad = campaign.advertisement;
  const trend = report.series.map((p) => ({ label: formatBucketLabel(p.bucket, "day"), impressions: p.impressions, clicks: p.clicks }));

  return (
    <>
      <PageHeader
        back={{ href: "/campaigns", label: "Campaigns" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name} <CampaignStatusBadge status={status} />
          </span>
        }
        description={campaign.description}
        actions={can(user.role, "campaigns:write") ? <CampaignActions uuid={campaign.uuid} name={campaign.name} status={status} /> : null}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {status === "ACTIVE" && (!ad || campaign.stations.length === 0) ? (
            <Alert variant="destructive">
              <AlertDescription>This campaign is active but has no {ad ? "stations" : "advertisement"}; nothing can be delivered.</AlertDescription>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-3">
                <Detail label="Start">{campaign.startAt ? <LocalDateTime value={campaign.startAt} /> : "On activation"}</Detail>
                <Detail label="End">{campaign.endAt ? <LocalDateTime value={campaign.endAt} /> : "No end date"}</Detail>
                <Detail label="Priority">{campaign.priority} / 100</Detail>
                <Detail label="Notification cooldown">
                  {campaign.cooldownMinutes ?? notification.defaultCooldownMinutes} min
                  {campaign.cooldownMinutes === null ? <span className="ml-1 font-normal text-muted-foreground">(default)</span> : null}
                </Detail>
                <Detail label="Max notifications per user per day">
                  {campaign.maxNotificationsPerDay ?? notification.maxNotificationsPerDay}
                  {campaign.maxNotificationsPerDay === null ? <span className="ml-1 font-normal text-muted-foreground">(global cap)</span> : null}
                </Detail>
                <Detail label="BLE campaign key">
                  <span className="font-mono">
                    {campaign.beaconKey} (0x{campaign.beaconKey.toString(16).toUpperCase().padStart(4, "0")})
                  </span>
                </Detail>
                <Detail label="Public ID">
                  <span className="font-mono text-xs break-all">{campaign.uuid}</span>
                </Detail>
                <Detail label="Created">
                  <LocalDateTime value={campaign.createdAt} />
                  {campaign.createdBy ? <span className="block font-normal text-muted-foreground">by {campaign.createdBy.name}</span> : null}
                </Detail>
                <Detail label="Last updated">
                  <TimeAgo value={campaign.updatedAt} />
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <CardDescription>Last 30 days, reported by the mobile app</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/analytics?campaign=${campaign.uuid}`}>Full report</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Impressions", formatNumber(report.totals.impressions)],
                  ["Clicks", formatNumber(report.totals.clicks)],
                  ["CTR", formatPercent(report.totals.ctr)],
                  ["Beacon detections", formatNumber(report.totals.detections)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              {report.totals.impressions + report.totals.clicks > 0 ? (
                <TrendChart data={trend} series={[SERIES.impressions, SERIES.clicks]} height={220} />
              ) : (
                <EmptyState icon={BellRing} title="No reported impressions in this period" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assigned stations</CardTitle>
              <CardDescription>Stations that broadcast this campaign when it is the highest-priority live campaign (or pinned).</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {campaign.stations.length === 0 ? (
                <div className="px-6">
                  <EmptyState icon={RadioTower} title="No stations assigned" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Station</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="pr-6">Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.stations.map(({ station }) => (
                      <TableRow key={station.stationCode}>
                        <TableCell className="pl-6">
                          <Link href={`/stations/${station.stationCode}`} className="font-medium hover:underline">
                            {station.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{station.stationCode}</TableCell>
                        <TableCell className="pr-6 text-muted-foreground">{station.location ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {ad ? (
            <>
              <NotificationPreview title={ad.title} message={ad.message} imageUrl={ad.imageUrl} ctaLabel={ad.ctaLabel} organizationName={system.organizationName} />
              <Card>
                <CardHeader>
                  <CardTitle>Advertisement</CardTitle>
                  <CardAction>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/advertisements/${ad.uuid}`}>Open</Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3">
                    <Detail label="Name">{ad.name}</Detail>
                    <Detail label="Landing page">
                      {ad.landingUrl ? (
                        <a href={ad.landingUrl} target="_blank" rel="noopener noreferrer" className="break-all text-info hover:underline">
                          {ad.landingUrl}
                        </a>
                      ) : (
                        "None"
                      )}
                    </Detail>
                  </dl>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState icon={BellRing} title="No advertisement attached" description="Edit the campaign to choose or create notification content." />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <p>{entry.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.user?.name ?? "System"} · <TimeAgo value={entry.createdAt} />
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
