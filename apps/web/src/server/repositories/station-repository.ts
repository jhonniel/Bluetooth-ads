import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { skipTake, type PageRequest } from "@/lib/pagination";

const live = { deletedAt: null } satisfies Prisma.BluetoothStationWhereInput;

export const stationListInclude = {
  currentCampaign: { select: { uuid: true, name: true } },
  _count: { select: { campaigns: { where: { campaign: { deletedAt: null } } } } },
} satisfies Prisma.BluetoothStationInclude;

export const stationDetailInclude = {
  currentCampaign: { select: { uuid: true, name: true, beaconKey: true } },
  targetCampaign: { select: { uuid: true, name: true } },
  campaigns: {
    where: { campaign: { deletedAt: null } },
    include: {
      campaign: {
        select: { id: true, uuid: true, name: true, status: true, priority: true, startAt: true, endAt: true, beaconKey: true, advertisementId: true },
      },
    },
  },
} satisfies Prisma.BluetoothStationInclude;

export type StationWithDetails = Prisma.BluetoothStationGetPayload<{ include: typeof stationDetailInclude }>;

export const stationRepository = {
  findByCode(stationCode: string, db: Db = prisma) {
    return db.bluetoothStation.findFirst({ where: { stationCode, ...live }, include: stationDetailInclude });
  },

  findByBeacon(beaconIdentifier: string, db: Db = prisma) {
    return db.bluetoothStation.findFirst({ where: { beaconIdentifier: beaconIdentifier.toLowerCase(), ...live } });
  },

  findManyByBeacons(beaconIdentifiers: string[], db: Db = prisma) {
    return db.bluetoothStation.findMany({
      where: { beaconIdentifier: { in: beaconIdentifiers.map((b) => b.toLowerCase()) }, ...live },
      select: { id: true, beaconIdentifier: true },
    });
  },

  findManyByCodes(codes: string[], db: Db = prisma) {
    return db.bluetoothStation.findMany({ where: { stationCode: { in: codes }, ...live }, select: { id: true, stationCode: true } });
  },

  codeExists(stationCode: string, db: Db = prisma) {
    return db.bluetoothStation.count({ where: { stationCode } }).then((count) => count > 0);
  },

  async list(filter: { q?: string; heartbeatAfter?: Date; heartbeatBefore?: Date }, page: PageRequest, db: Db = prisma) {
    const where: Prisma.BluetoothStationWhereInput = {
      ...live,
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { stationCode: { contains: filter.q, mode: "insensitive" } },
              { location: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.bluetoothStation.findMany({ where, include: stationListInclude, orderBy: { name: "asc" }, ...skipTake(page) }),
      db.bluetoothStation.count({ where }),
    ]);
    return { items, total };
  },

  search(q: string, limit: number, db: Db = prisma) {
    return db.bluetoothStation.findMany({
      where: {
        ...live,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { stationCode: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { stationCode: true, name: true, location: true },
      orderBy: { name: "asc" },
      take: limit,
    });
  },

  overview(limit: number, db: Db = prisma) {
    return db.bluetoothStation.findMany({
      where: live,
      include: stationListInclude,
      orderBy: [{ lastHeartbeat: { sort: "desc", nulls: "last" } }],
      take: limit,
    });
  },

  countAll(db: Db = prisma) {
    return db.bluetoothStation.count({ where: live });
  },

  countOnline(heartbeatAfter: Date, db: Db = prisma) {
    return db.bluetoothStation.count({ where: { ...live, lastHeartbeat: { gt: heartbeatAfter }, status: "ONLINE" } });
  },

  create(data: Prisma.BluetoothStationUncheckedCreateInput, db: Db = prisma) {
    return db.bluetoothStation.create({ data });
  },

  update(id: number, data: Prisma.BluetoothStationUncheckedUpdateInput, db: Db = prisma) {
    return db.bluetoothStation.update({ where: { id }, data });
  },

  /** Signals agents to re-sync. Called whenever anything that affects a station's broadcast changes. */
  bumpConfigRevision(stationIds: number[], db: Db = prisma) {
    if (stationIds.length === 0) return Promise.resolve({ count: 0 });
    return db.bluetoothStation.updateMany({ where: { id: { in: stationIds } }, data: { configRevision: { increment: 1 } } });
  },

  bumpAllConfigRevisions(db: Db = prisma) {
    return db.bluetoothStation.updateMany({ where: live, data: { configRevision: { increment: 1 } } });
  },

  identityByCode(stationCode: string, db: Db = prisma) {
    return db.bluetoothStation.findUnique({ where: { stationCode }, select: { id: true, stationCode: true, name: true } });
  },

  namesByIds(ids: number[], db: Db = prisma) {
    return db.bluetoothStation.findMany({ where: { id: { in: ids } }, select: { id: true, stationCode: true, name: true, location: true } });
  },

  clearTargetCampaign(campaignId: number, exceptStationIds: number[] = [], db: Db = prisma) {
    return db.bluetoothStation.updateMany({
      where: { targetCampaignId: campaignId, id: { notIn: exceptStationIds } },
      data: { targetCampaignId: null },
    });
  },

  softDelete(id: number, db: Db = prisma) {
    return db.bluetoothStation.update({ where: { id }, data: { deletedAt: new Date(), advertisingEnabled: false, status: "OFFLINE" } });
  },

  async replaceCampaigns(stationId: number, campaignIds: number[], db: Db = prisma) {
    await db.campaignStation.deleteMany({ where: { stationId, campaignId: { notIn: campaignIds } } });
    if (campaignIds.length) {
      await db.campaignStation.createMany({ data: campaignIds.map((campaignId) => ({ campaignId, stationId })), skipDuplicates: true });
    }
  },
};
