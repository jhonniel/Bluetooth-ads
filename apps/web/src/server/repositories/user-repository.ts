import "server-only";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { skipTake, type PageRequest } from "@/lib/pagination";

export const userPublicSelect = {
  id: true,
  uuid: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const userRepository = {
  findByEmail(email: string, db: Db = prisma) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findActiveByUuid(uuid: string, db: Db = prisma) {
    return db.user.findFirst({ where: { uuid, isActive: true }, select: userPublicSelect });
  },

  findByUuid(uuid: string, db: Db = prisma) {
    return db.user.findUnique({ where: { uuid }, select: userPublicSelect });
  },

  async list(filter: { q?: string }, page: PageRequest, db: Db = prisma) {
    const where: Prisma.UserWhereInput = filter.q
      ? { OR: [{ name: { contains: filter.q, mode: "insensitive" } }, { email: { contains: filter.q, mode: "insensitive" } }] }
      : {};
    const [items, total] = await Promise.all([
      db.user.findMany({ where, select: userPublicSelect, orderBy: { createdAt: "asc" }, ...skipTake(page) }),
      db.user.count({ where }),
    ]);
    return { items, total };
  },

  countActiveAdmins(db: Db = prisma) {
    return db.user.count({ where: { role: "ADMIN", isActive: true } });
  },

  create(data: { name: string; email: string; passwordHash: string; role: UserRole }, db: Db = prisma) {
    return db.user.create({ data: { ...data, email: data.email.toLowerCase() }, select: userPublicSelect });
  },

  update(uuid: string, data: Prisma.UserUpdateInput, db: Db = prisma) {
    return db.user.update({ where: { uuid }, data, select: userPublicSelect });
  },

  touchLogin(id: number, db: Db = prisma) {
    return db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },
};
