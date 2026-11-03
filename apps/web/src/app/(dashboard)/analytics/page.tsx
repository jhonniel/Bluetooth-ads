import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, BellRing, Info, MousePointerClick, Percent, Radar, Smartphone } from "lucide-react";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { HorizontalBarChart, TrendChart } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/series";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { CampaignStatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBucketLabel, formatNumber, formatPercent } from "@/lib/format";
import { localDateString } from "@/server/domain/notification-policy";
import { requirePageUser } from "@/server/authz";
import { analyticsQuerySchema, analyticsService } from "@/server/services/analytics-service";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const GRANULARITY_LABEL = { day: "Daily", week: "Weekly", month: "Monthly" } as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("analytics:read");
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = analyticsQuerySchema.safeParse(flat);
  const [report, system] = await Promise.all([analyticsService.report(parsed.success ? parsed.data : {}), settingsService.getSystemSettings()]);
  const { view, totals } = report;
  const today = localDateString(new Date(), system.timezone);

  const trend = report.series.map((p) => ({
    label: formatBucketLabel(p.bucket, view.granularity),
    impressions: p.impressions,
    clicks: p.clicks,
    detections: p.detections,
  }));
  const hasData = totals.impressions + totals.clicks + totals.detections > 0;

  return (
    <>
      <PageHeader title="Analytics" description={`${GRANULARITY_LABEL[view.granularity]} report from ${view.from} to ${view.to} (${system.timezone}).`} />
      <div className="space-y-4">
        {!parsed.success ? (
          <Alert variant="destructive">
            <AlertDescription>Some filters were invalid and have been ignored.</AlertDescription>
          </Alert>
        ) : null}
        <AnalyticsFilters view={view} today={today} />

        <Alert>
          <Info />
          <AlertDescription>
            Impressions count only notifications the mobile app reports as displayed. Beacon detections are shown separately and are never counted as delivered notifications.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Impressions" value={formatNumber(totals.impressions)} icon={BellRing} />
          <StatCard label="Clicks" value={formatNumber(totals.clicks)} icon={MousePointerClick} />
          <StatCard label="Click-through rate" value={formatPercent(totals.ctr)} icon={Percent} />
          <StatCard label="Unique devices reached" value={formatNumber(totals.uniqueDevices)} icon={Smartphone} hint="Anonymous app installs" />
          <StatCard label="Beacon detections" value={formatNumber(totals.detections)} icon={Radar} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Impressions, clicks and detections over time</CardTitle>
            <CardDescription>{GRANULARITY_LABEL[view.granularity]} buckets</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <TrendChart data={trend} series={[SERIES.impressions, SERIES.clicks, SERIES.detections]} height={320} />
            ) : (
              <EmptyState icon={BarChart3} title="No events in this range" description="Adjust the date range or filters." />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Campaign performance</CardTitle>
            </CardHeader>
            <CardContent>
              {report.campaigns.length ? (
                <HorizontalBarChart
                  data={report.campaigns.slice(0, 8).map((c) => ({ label: c.name, impressions: c.impressions, clicks: c.clicks }))}
                  series={[SERIES.impressions, SERIES.clicks]}
                  height={Math.max(200, Math.min(8, report.campaigns.length) * 52)}
                />
              ) : (
                <EmptyState icon={BarChart3} title="No campaign data" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Station performance</CardTitle>
            </CardHeader>
            <CardContent>
              {report.stations.length ? (
                <HorizontalBarChart
                  data={report.stations.slice(0, 8).map((s) => ({ label: s.name, impressions: s.impressions, clicks: s.clicks }))}
                  series={[SERIES.impressions, SERIES.clicks]}
                  height={Math.max(200, Math.min(8, report.stations.length) * 52)}
                />
              ) : (
                <EmptyState icon={BarChart3} title="No station data" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Campaign</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="pr-6 text-right">CTR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.campaigns.map((c) => (
                    <TableRow key={c.uuid}>
                      <TableCell className="max-w-56 pl-6">
                        {c.deleted ? (
                          <span className="block truncate">{c.name} (deleted)</span>
                        ) : (
                          <Link href={`/campaigns/${c.uuid}`} className="block truncate font-medium hover:underline">
                            {c.name}
                          </Link>
                        )}
                        <CampaignStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                    </TableRow>
                  ))}
                  {report.campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stations</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Station</TableHead>
                    <TableHead className="text-right">Detections</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="pr-6 text-right">CTR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.stations.map((s) => (
                    <TableRow key={s.code}>
                      <TableCell className="max-w-56 pl-6">
                        <Link href={`/stations/${s.code}`} className="block truncate font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{s.location ?? s.code}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(s.detections)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(s.impressions)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{formatPercent(s.ctr)}</TableCell>
                    </TableRow>
                  ))}
                  {report.stations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
