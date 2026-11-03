import "server-only";
import { prisma, type Db } from "@/lib/db";

export const stationCredentialRepository = {
  /** Resolves a token hash to a usable credential and its live station. */
  findUsableByHash(tokenHash: string, now: Date, db: Db = prisma) {
    return db.stationCredential.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        station: { deletedAt: null },
      },
      include: { station: true },
    });
  },

  listForStation(stationId: number, db: Db = prisma) {
    return db.stationCredential.findMany({ where: { stationId }, orderBy: { createdAt: "desc" } });
  },

  create(data: { stationId: number; tokenHash: string; tokenPrefix: string; expiresAt: Date | null }, db: Db = prisma) {
    return db.stationCredential.create({ data });
  },

  revoke(stationId: number, uuid: string, db: Db = prisma) {
    return db.stationCredential.updateMany({ where: { stationId, uuid, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  revokeAll(stationId: number, exceptId?: number, db: Db = prisma) {
    return db.stationCredential.updateMany({
      where: { stationId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    });
  },

  touch(id: number, db: Db = prisma) {
    return db.stationCredential.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },
};
