import "server-only";
import type { Prisma, StationCommandStatus, StationCommandType } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";

export const stationCommandRepository = {
  expireStale(stationId: number, now: Date, db: Db = prisma) {
    return db.stationCommand.updateMany({
      where: { stationId, status: { in: ["PENDING", "DELIVERED"] }, expiresAt: { lte: now } },
      data: { status: "EXPIRED", result: "Expired before the station executed it." },
    });
  },

  /** Supersedes queued start/stop commands so the latest intent wins. */
  supersedeAdvertisingCommands(stationId: number, db: Db = prisma) {
    return db.stationCommand.updateMany({
      where: { stationId, status: { in: ["PENDING", "DELIVERED"] }, commandType: { in: ["START_ADVERTISING", "STOP_ADVERTISING"] } },
      data: { status: "EXPIRED", result: "Superseded by a newer command." },
    });
  },

  outstanding(stationId: number, now: Date, db: Db = prisma) {
    return db.stationCommand.findMany({
      where: { stationId, status: { in: ["PENDING", "DELIVERED"] }, expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
  },

  countPending(stationId: number, now: Date, db: Db = prisma) {
    return db.stationCommand.count({ where: { stationId, status: { in: ["PENDING", "DELIVERED"] }, expiresAt: { gt: now } } });
  },

  markDelivered(ids: number[], now: Date, db: Db = prisma) {
    return db.stationCommand.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "DELIVERED", deliveredAt: now } });
  },

  findForStation(stationId: number, uuid: string, db: Db = prisma) {
    return db.stationCommand.findFirst({ where: { stationId, uuid } });
  },

  complete(id: number, status: Extract<StationCommandStatus, "SUCCEEDED" | "FAILED">, result: string | null, executedAt: Date, db: Db = prisma) {
    return db.stationCommand.update({ where: { id }, data: { status, result, executedAt } });
  },

  create(
    data: { stationId: number; commandType: StationCommandType; payload?: Prisma.InputJsonValue; createdById: number | null; expiresAt: Date },
    db: Db = prisma,
  ) {
    return db.stationCommand.create({ data });
  },

  recent(stationId: number, limit: number, db: Db = prisma) {
    return db.stationCommand.findMany({
      where: { stationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { createdBy: { select: { name: true } } },
    });
  },
};
