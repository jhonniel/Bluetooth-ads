import "server-only";
import type { LogLevel, Prisma, StationLogType } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";

export interface StationLogEntry {
  stationId: number;
  type: StationLogType;
  level?: LogLevel;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

const ADVERTISING_TYPES: StationLogType[] = ["ADVERTISING_STARTED", "ADVERTISING_STOPPED", "ADVERTISING_ERROR"];
const CONNECTION_TYPES: StationLogType[] = ["REGISTERED", "CONNECTED", "DISCONNECTED", "STATUS_CHANGED"];

export const stationLogRepository = {
  create(entry: StationLogEntry, db: Db = prisma) {
    return db.stationLog.create({ data: { ...entry, message: entry.message.slice(0, 500) } });
  },

  createMany(entries: StationLogEntry[], db: Db = prisma) {
    if (entries.length === 0) return Promise.resolve({ count: 0 });
    return db.stationLog.createMany({ data: entries.map((e) => ({ ...e, message: e.message.slice(0, 500) })) });
  },

  recent(stationId: number, kind: "all" | "advertising" | "connection", limit: number, db: Db = prisma) {
    const typeFilter = kind === "advertising" ? ADVERTISING_TYPES : kind === "connection" ? CONNECTION_TYPES : undefined;
    return db.stationLog.findMany({
      where: { stationId, ...(typeFilter ? { type: { in: typeFilter } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  recentAcrossStations(limit: number, db: Db = prisma) {
    return db.stationLog.findMany({
      where: { station: { deletedAt: null }, type: { in: [...ADVERTISING_TYPES, "CONNECTED", "DISCONNECTED", "STATUS_CHANGED"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { station: { select: { name: true, stationCode: true } } },
    });
  },
};
