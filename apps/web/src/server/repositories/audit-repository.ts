import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";

export interface AuditEntry {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

export const auditRepository = {
  create(entry: AuditEntry, db: Db = prisma) {
    return db.auditLog.create({ data: { ...entry, entityId: entry.entityId ?? null } });
  },

  recent(limit: number, db: Db = prisma) {
    return db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true } } },
    });
  },

  forEntity(entityType: string, entityId: string, limit: number, db: Db = prisma) {
    return db.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true } } },
    });
  },
};
