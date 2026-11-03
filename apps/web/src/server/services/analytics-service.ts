import "server-only";
import { z } from "zod";
import { localDateString, zonedMidnight } from "@/server/domain/notification-policy";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { eventRepository, type EventCounts, type EventFilter, type Granularity } from "@/server/repositories/event-repository";
import { settingsService } from "./settings-service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analyticsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  granularity: z.enum(["day", "week", "month"]).optional(),
  campaign: z.uuid().optional(),
  station: z.string().max(32).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const MAX_RANGE_DAYS = 366;

export function ctr(clicks: number, impressions: number): number {
  return impressions === 0 ? 0 : clicks / impressions;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bucket keys (local wall-clock dates) covering the range, aligned like Postgres date_trunc. */
function bucketKeys(from: string, to: string, granularity: Granularity): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  if (granularity === "month") cursor.setUTCDate(1);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

const totalsFrom = (counts: EventCounts) => ({
  detections: counts.beacon_detected,
  impressions: counts.notification_displayed,
  clicks: counts.notification_clicked,
  ctr: ctr(counts.notification_clicked, counts.notification_displayed),
});

export const analyticsService = {
  async resolveFilters(query: AnalyticsQuery) {
    const system = await settingsService.getSystemSettings();
    const timeZone = system.timezone;
    const today = localDateString(new Date(), timeZone);
    let to = query.to ?? today;
    let from = query.from ?? addDays(to, -29);
    if (from > to) [from, to] = [to, from];
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);

    const [campaign, station] = await Promise.all([
      query.campaign ? campaignRepository.identityByUuid(query.campaign) : null,
      query.station ? stationRepository.identityByCode(query.station) : null,
    ]);

    const filter: EventFilter = {
      from: zonedMidnight(from, timeZone),
      to: zonedMidnight(addDays(to, 1), timeZone),
      ...(campaign ? { campaignId: campaign.id } : {}),
      ...(station ? { stationId: station.id } : {}),
    };
    return {
      filter,
      timeZone,
      view: {
        from,
        to,
        granularity: (query.granularity ?? "day") as Granularity,
        campaign: campaign ? { uuid: campaign.uuid, name: campaign.name } : null,
        station: station ? { code: station.stationCode, name: station.name } : null,
      },
    };
  },

  async report(query: AnalyticsQuery) {
    const { filter, timeZone, view } = await this.resolveFilters(query);
    const [counts, uniqueDevices, rows, byCampaign, byStation] = await Promise.all([
      eventRepository.countsByType(filter),
      eventRepository.uniqueDevices(filter),
      eventRepository.timeSeries(filter, view.granularity, timeZone),
      eventRepository.countsByCampaign(filter),
      eventRepository.countsByStation(filter),
    ]);

    const seriesMap = new Map(bucketKeys(view.from, view.to, view.granularity).map((key) => [key, { detections: 0, impressions: 0, clicks: 0 }]));
    for (const row of rows) {
      const key = row.bucket.toISOString().slice(0, 10);
      const bucket = seriesMap.get(key) ?? { detections: 0, impressions: 0, clicks: 0 };
      if (row.eventType === "beacon_detected") bucket.detections += row.count;
      if (row.eventType === "notification_displayed") bucket.impressions += row.count;
      if (row.eventType === "notification_clicked") bucket.clicks += row.count;
      seriesMap.set(key, bucket);
    }

    const [campaigns, stations] = await Promise.all([
      campaignRepository.namesByIds([...byCampaign.keys()]),
      stationRepository.namesByIds([...byStation.keys()]),
    ]);

    return {
      view,
      totals: { ...totalsFrom(counts), uniqueDevices },
      series: [...seriesMap.entries()].map(([bucket, values]) => ({ bucket, ...values, ctr: ctr(values.clicks, values.impressions) })),
      campaigns: campaigns
        .map((c) => ({ uuid: c.uuid, name: c.name, status: c.status, deleted: c.deletedAt !== null, ...totalsFrom(byCampaign.get(c.id)!) }))
        .sort((a, b) => b.impressions - a.impressions),
      stations: stations
        .map((s) => ({ code: s.stationCode, name: s.name, location: s.location, ...totalsFrom(byStation.get(s.id)!) }))
        .sort((a, b) => b.impressions - a.impressions),
    };
  },
};

export type AnalyticsReport = Awaited<ReturnType<typeof analyticsService.report>>;
