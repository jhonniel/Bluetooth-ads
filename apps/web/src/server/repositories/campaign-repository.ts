import "server-only";
import type { CampaignStatus, Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { skipTake, type PageRequest } from "@/lib/pagination";

const live = { deletedAt: null } satisfies Prisma.CampaignWhereInput;

export const campaignDetailInclude = {
  advertisement: true,
  stations: {
    where: { station: { deletedAt: null } },
    include: { station: { select: { id: true, name: true, stationCode: true, location: true } } },
  },
  createdBy: { select: { name: true } },
} satisfies Prisma.CampaignInclude;

export type CampaignWithDetails = Prisma.CampaignGetPayload<{ include: typeof campaignDetailInclude }>;

export interface CampaignWriteData {
  name: string;
  description: string | null;
  advertisementId: number | null;
  startAt: Date | null;
  endAt: Date | null;
  priority: number;
  cooldownMinutes: number | null;
  maxNotificationsPerDay: number | null;
}

export const campaignRepository = {
  /**
   * Persists schedule-driven transitions (SCHEDULED -> ACTIVE -> EXPIRED). Reads also derive the
   * effective status, so this only keeps stored values and filters accurate.
   */
  async syncScheduledStatuses(now = new Date(), db: Db = prisma) {
    const expired = await db.campaign.updateMany({
      where: { ...live, status: { in: ["ACTIVE", "SCHEDULED"] }, endAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    const started = await db.campaign.updateMany({
      where: { ...live, status: "SCHEDULED", startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] },
      data: { status: "ACTIVE" },
    });
    return { expired: expired.count, started: started.count };
  },

  findByUuid(uuid: string, db: Db = prisma) {
    return db.campaign.findFirst({ where: { uuid, ...live }, include: campaignDetailInclude });
  },

  findManyByUuids(uuids: string[], db: Db = prisma) {
    return db.campaign.findMany({ where: { uuid: { in: uuids }, ...live } });
  },

  async list(filter: { q?: string; status?: CampaignStatus }, page: PageRequest, db: Db = prisma) {
    const where: Prisma.CampaignWhereInput = {
      ...live,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      db.campaign.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        include: {
          advertisement: { select: { uuid: true, name: true, title: true } },
          _count: { select: { stations: { where: { station: { deletedAt: null } } } } },
        },
        ...skipTake(page),
      }),
      db.campaign.count({ where }),
    ]);
    return { items, total };
  },

  search(q: string, limit: number, db: Db = prisma) {
    return db.campaign.findMany({
      where: { ...live, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      select: { uuid: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  },

  recent(limit: number, db: Db = prisma) {
    return db.campaign.findMany({
      where: live,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        advertisement: { select: { title: true } },
        _count: { select: { stations: { where: { station: { deletedAt: null } } } } },
      },
    });
  },

  countByStatus(db: Db = prisma) {
    return db.campaign.groupBy({ by: ["status"], where: live, _count: { _all: true } });
  },

  create(data: CampaignWriteData & { createdById: number | null }, db: Db = prisma) {
    return db.campaign.create({ data });
  },

  update(id: number, data: Partial<CampaignWriteData> & { status?: CampaignStatus }, db: Db = prisma) {
    return db.campaign.update({ where: { id }, data });
  },

  softDelete(id: number, db: Db = prisma) {
    return db.campaign.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },

  stationIdsForAdvertisement(advertisementId: number, db: Db = prisma) {
    return db.campaignStation
      .findMany({ where: { campaign: { advertisementId, deletedAt: null } }, select: { stationId: true }, distinct: ["stationId"] })
      .then((rows) => rows.map((r) => r.stationId));
  },

  /** Existing campaign/station assignment pairs among the given ids. */
  assignments(campaignIds: number[], stationIds: number[], db: Db = prisma) {
    return db.campaignStation.findMany({
      where: { campaignId: { in: campaignIds }, stationId: { in: stationIds } },
      select: { campaignId: true, stationId: true },
    });
  },

  identityByUuid(uuid: string, db: Db = prisma) {
    return db.campaign.findUnique({ where: { uuid }, select: { id: true, uuid: true, name: true } });
  },

  namesByIds(ids: number[], db: Db = prisma) {
    return db.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, uuid: true, name: true, status: true, deletedAt: true } });
  },

  stationIdsFor(campaignId: number, db: Db = prisma) {
    return db.campaignStation.findMany({ where: { campaignId }, select: { stationId: true } }).then((rows) => rows.map((r) => r.stationId));
  },

  async replaceStations(campaignId: number, stationIds: number[], db: Db = prisma) {
    await db.campaignStation.deleteMany({ where: { campaignId, stationId: { notIn: stationIds } } });
    if (stationIds.length) {
      await db.campaignStation.createMany({
        data: stationIds.map((stationId) => ({ campaignId, stationId })),
        skipDuplicates: true,
      });
    }
  },

  /** All non-deleted campaigns assigned to a station, with content needed to serve them. */
  assignedToStation(stationId: number, db: Db = prisma) {
    return db.campaign.findMany({
      where: { ...live, stations: { some: { stationId } } },
      include: { advertisement: true },
      orderBy: [{ priority: "desc" }, { startAt: "desc" }],
    });
  },
};
