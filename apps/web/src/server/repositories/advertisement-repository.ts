import "server-only";
import type { Prisma } from "@prisma/client";
import type { AdvertisementData } from "@bpa/shared";
import { prisma, type Db } from "@/lib/db";
import { skipTake, type PageRequest } from "@/lib/pagination";

const live = { deletedAt: null } satisfies Prisma.AdvertisementWhereInput;

export const advertisementRepository = {
  findByUuid(uuid: string, db: Db = prisma) {
    return db.advertisement.findFirst({
      where: { uuid, ...live },
      include: { _count: { select: { campaigns: { where: { deletedAt: null } } } } },
    });
  },

  async list(filter: { q?: string }, page: PageRequest, db: Db = prisma) {
    const where: Prisma.AdvertisementWhereInput = {
      ...live,
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { title: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.advertisement.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { campaigns: { where: { deletedAt: null } } } } },
        ...skipTake(page),
      }),
      db.advertisement.count({ where }),
    ]);
    return { items, total };
  },

  search(q: string, limit: number, db: Db = prisma) {
    return db.advertisement.findMany({
      where: { ...live, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}) },
      select: { uuid: true, name: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  },

  create(data: AdvertisementData, db: Db = prisma) {
    return db.advertisement.create({ data });
  },

  update(id: number, data: AdvertisementData, db: Db = prisma) {
    return db.advertisement.update({ where: { id }, data });
  },

  softDelete(id: number, db: Db = prisma) {
    return db.advertisement.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  campaignsUsing(id: number, limit: number, db: Db = prisma) {
    return db.campaign.findMany({
      where: { advertisementId: id, deletedAt: null },
      select: { uuid: true, name: true, status: true, startAt: true, endAt: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  },

  /** Campaigns that would break if the advertisement disappeared. */
  countBlockingCampaigns(id: number, db: Db = prisma) {
    return db.campaign.count({
      where: { advertisementId: id, deletedAt: null, status: { in: ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"] } },
    });
  },
};
