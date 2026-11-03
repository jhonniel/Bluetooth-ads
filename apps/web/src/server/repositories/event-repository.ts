import "server-only";
import { Prisma, type AdvertisingEventType } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";

export interface EventFilter {
  from: Date;
  to: Date;
  campaignId?: number;
  stationId?: number;
}

export type Granularity = "day" | "week" | "month";

function whereSql(filter: EventFilter): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`e.occurred_at >= ${filter.from}`, Prisma.sql`e.occurred_at < ${filter.to}`];
  if (filter.campaignId !== undefined) clauses.push(Prisma.sql`e.campaign_id = ${filter.campaignId}`);
  if (filter.stationId !== undefined) clauses.push(Prisma.sql`e.station_id = ${filter.stationId}`);
  return Prisma.join(clauses, " AND ");
}

function whereInput(filter: EventFilter): Prisma.AdvertisingEventWhereInput {
  return {
    occurredAt: { gte: filter.from, lt: filter.to },
    ...(filter.campaignId !== undefined ? { campaignId: filter.campaignId } : {}),
    ...(filter.stationId !== undefined ? { stationId: filter.stationId } : {}),
  };
}

export interface EventCounts {
  beacon_detected: number;
  notification_displayed: number;
  notification_clicked: number;
}

const emptyCounts = (): EventCounts => ({ beacon_detected: 0, notification_displayed: 0, notification_clicked: 0 });

export const eventRepository = {
  createMany(data: Prisma.AdvertisingEventCreateManyInput[], db: Db = prisma) {
    return db.advertisingEvent.createMany({ data });
  },

  async countsByType(filter: EventFilter | null, db: Db = prisma): Promise<EventCounts> {
    const rows = await db.advertisingEvent.groupBy({
      by: ["eventType"],
      where: filter ? whereInput(filter) : {},
      _count: { _all: true },
    });
    const counts = emptyCounts();
    for (const row of rows) counts[row.eventType] = row._count._all;
    return counts;
  },

  async uniqueDevices(filter: EventFilter, db: Db = prisma): Promise<number> {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT e.anonymous_device_token)::bigint AS count
      FROM advertising_events e
      WHERE ${whereSql(filter)} AND e.event_type = 'notification_displayed'`;
    return Number(rows[0]?.count ?? 0);
  },

  /**
   * Event counts bucketed by local calendar period in the given IANA time zone. Columns are UTC
   * timestamps without zone, so they are anchored to UTC before converting to local time. Buckets
   * come back as local wall-clock values; read them with UTC accessors.
   */
  async timeSeries(filter: EventFilter, granularity: Granularity, timeZone: string, db: Db = prisma) {
    const unit = Prisma.raw(`'${granularity}'`);
    const rows = await db.$queryRaw<{ bucket: Date; event_type: AdvertisingEventType; count: bigint }[]>`
      SELECT date_trunc(${unit}, (e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) AS bucket, e.event_type, COUNT(*)::bigint AS count
      FROM advertising_events e
      WHERE ${whereSql(filter)}
      GROUP BY 1, 2
      ORDER BY 1`;
    return rows.map((row) => ({ bucket: row.bucket, eventType: row.event_type, count: Number(row.count) }));
  },

  async countsByCampaign(filter: EventFilter, db: Db = prisma) {
    const rows = await db.advertisingEvent.groupBy({
      by: ["campaignId", "eventType"],
      where: whereInput(filter),
      _count: { _all: true },
    });
    const map = new Map<number, EventCounts>();
    for (const row of rows) {
      const counts = map.get(row.campaignId) ?? emptyCounts();
      counts[row.eventType] = row._count._all;
      map.set(row.campaignId, counts);
    }
    return map;
  },

  async countsByStation(filter: EventFilter, db: Db = prisma) {
    const rows = await db.advertisingEvent.groupBy({
      by: ["stationId", "eventType"],
      where: { ...whereInput(filter), stationId: filter.stationId ?? { not: null } },
      _count: { _all: true },
    });
    const map = new Map<number, EventCounts>();
    for (const row of rows) {
      if (row.stationId === null) continue;
      const counts = map.get(row.stationId) ?? emptyCounts();
      counts[row.eventType] = row._count._all;
      map.set(row.stationId, counts);
    }
    return map;
  },

  /** Per-campaign display history for one device, used for frequency capping. */
  async displayHistory(deviceHash: string, since: Date, db: Db = prisma) {
    return db.advertisingEvent.findMany({
      where: { anonymousDeviceToken: deviceHash, eventType: "notification_displayed", occurredAt: { gte: since } },
      select: { campaignId: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
    });
  },

  lastDisplayedPerCampaign(deviceHash: string, campaignIds: number[], db: Db = prisma) {
    return db.advertisingEvent.groupBy({
      by: ["campaignId"],
      where: { anonymousDeviceToken: deviceHash, eventType: "notification_displayed", campaignId: { in: campaignIds } },
      _max: { occurredAt: true },
    });
  },

  /** Existing events that would make a newly reported event a duplicate. */
  recentForDevices(deviceHashes: string[], campaignIds: number[], since: Date, db: Db = prisma) {
    return db.advertisingEvent.findMany({
      where: { anonymousDeviceToken: { in: deviceHashes }, campaignId: { in: campaignIds }, occurredAt: { gte: since } },
      select: { anonymousDeviceToken: true, campaignId: true, eventType: true, occurredAt: true },
    });
  },
};
