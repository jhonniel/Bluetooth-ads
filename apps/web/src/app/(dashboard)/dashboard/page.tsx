import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Megaphone,
  MousePointerClick,
  Percent,
  RadioTower,
  Radar,
  Wifi,
} from "lucide-react";
import { HorizontalBarChart, TrendChart } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/series";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/misc";
import { StatCard } from "@/components/common/stat-card";
import { BluetoothStatusBadge, CampaignStatusBadge, StationStatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { env } from "@/lib/env";
import { formatBucketLabel, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/authz";
import { dashboardService } from "@/server/services/dashboard-service";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requirePageUser("dashboard:read");
  const [{ denied }, overview, system] = await Promise.all([searchParams, dashboardService.overview(), settingsService.getSystemSettings()]);
  const { stats, last30Days, stations, recentCampaigns, activity } = overview;
  const usingTestCompanyId = system.defaultManufacturerId === null && env().ALLOW_TEST_COMPANY_ID;

  const trend = last30Days.series.map((p) => ({ label: formatBucketLabel(p.bucket, "day"), impressions: p.impressions, clicks: p.clicks }));
  const campaignBars = last30Days.campaigns.slice(0, 6).map((c) => ({ label: c.name, impressions: c.impressions, clicks: c.clicks }));

  return (
    <>
      <PageHeader title="Dashboard" description="Campaign delivery and station health at a glance. Metrics only include events reported by the mobile app." />

      <div className="space-y-4">
        {denied ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Access denied</AlertTitle>
            <AlertDescription>Your role does not have permission to open that page.</AlertDescription>
          </Alert>
        ) : null}
        {usingTestCompanyId ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Development company identifier in use</AlertTitle>
            <AlertDescription>
              Stations broadcast with the Bluetooth SIG test identifier 0xFFFF because no company identifier is configured. Set your assigned
              identifier in <Link className="underline" href="/settings/system">System Settings</Link> before production use.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total campaigns" value={formatNumber(stats.campaignTotal)} icon={Megaphone} hint="Excludes deleted campaigns" />
          <StatCard label="Active campaigns" value={formatNumber(stats.activeCampaigns)} icon={Activity} hint="Live now, within schedule" />
          <StatCard label="Registered stations" value={formatNumber(stats.stationTotal)} icon={RadioTower} hint="Windows advertising stations" />
          <StatCard label="Online stations" value={formatNumber(stats.stationsOnline)} icon={Wifi} hint="Heartbeat within threshold" />
          <StatCard label="Reported impressions" value={formatNumber(stats.impressions)} icon={BellRing} hint="Notifications displayed by the app" />
          <StatCard label="Notification clicks" value={formatNumber(stats.clicks)} icon={MousePointerClick} hint="Taps reported by the app" />
          <StatCard label="Click-through rate" value={formatPercent(stats.ctr)} icon={Percent} hint="Clicks ÷ impressions" />
          <StatCard label="Beacon detections" value={formatNumber(stats.detections)} icon={Radar} hint="Not counted as impressions" />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Impressions and clicks</CardTitle>
              <CardDescription>Last 30 days, in {system.timezone}</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/analytics">Open analytics</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {last30Days.totals.impressions + last30Days.totals.clicks === 0 ? (
                <EmptyState icon={BellRing} title="No reported events yet" description="Impressions appear when the mobile app reports displayed notifications." />
              ) : (
                <TrendChart data={trend} series={[SERIES.impressions, SERIES.clicks]} />
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Campaign performance</CardTitle>
              <CardDescription>Top campaigns by impressions, last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignBars.length === 0 ? (
                <EmptyState icon={Megaphone} title="No campaign activity" />
              ) : (
                <HorizontalBarChart data={campaignBars} series={[SERIES.impressions, SERIES.clicks]} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Recent campaigns</CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/campaigns">View all</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0">
              {recentCampaigns.length === 0 ? (
                <div className="px-6">
                  <EmptyState icon={Megaphone} title="No campaigns yet" action={<Button asChild size="sm"><Link href="/campaigns/new">Create campaign</Link></Button>} />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Stations</TableHead>
                      <TableHead className="pr-6 text-right">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCampaigns.map((c) => (
                      <TableRow key={c.uuid}>
                        <TableCell className="max-w-64 pl-6">
                          <Link href={`/campaigns/${c.uuid}`} className="block truncate font-medium hover:underline">
                            {c.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">{c.advertisement?.title ?? "No advertisement"}</span>
                        </TableCell>
                        <TableCell>
                          <CampaignStatusBadge status={c.effectiveStatus} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c._count.stations}</TableCell>
                        <TableCell className="pr-6 text-right text-sm text-muted-foreground">
                          <TimeAgo value={c.updatedAt} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Station activity</CardTitle>
              <CardDescription>Status as reported by Windows agents</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/stations">Manage</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {stations.length === 0 ? (
                <EmptyState icon={RadioTower} title="No stations registered" />
              ) : (
                <ul className="divide-y">
                  {stations.map((s) => (
                    <li key={s.stationCode} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/stations/${s.stationCode}`} className="block truncate text-sm font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          Heartbeat <TimeAgo value={s.lastHeartbeat} />
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StationStatusBadge status={s.effectiveStatus} />
                        {s.lastHeartbeat ? <BluetoothStatusBadge status={s.bluetoothStatus} stale={s.effectiveStatus === "OFFLINE"} /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Administrative changes and station events</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet" />
            ) : (
              <ol className="space-y-3">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.level === "ERROR" ? "bg-destructive" : item.level === "WARN" ? "bg-warning" : item.kind === "station" ? "bg-info" : "bg-muted-foreground/50",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      {item.href ? (
                        <Link href={item.href} className="hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        <span>{item.title}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {item.actor ? `${item.actor} · ` : item.kind === "station" ? "Station agent · " : ""}
                        <TimeAgo value={item.at} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
