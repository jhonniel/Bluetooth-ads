import "server-only";
import type { Prisma } from "@prisma/client";
import type { Db } from "@/lib/db";
import { auditRepository } from "@/server/repositories/audit-repository";
import type { CurrentUser } from "@/server/authz";

export const auditService = {
  record(
    actor: CurrentUser | null,
    action: string,
    entity: { type: string; id?: string | null },
    summary: string,
    metadata?: Prisma.InputJsonValue,
    db?: Db,
  ) {
    return auditRepository.create(
      { userId: actor?.id ?? null, action, entityType: entity.type, entityId: entity.id ?? null, summary, metadata },
      db,
    );
  },
};
