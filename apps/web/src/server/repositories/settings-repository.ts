import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";

export const settingsRepository = {
  getNotificationSettings(db: Db = prisma) {
    return db.notificationSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  },

  updateNotificationSettings(data: Prisma.NotificationSettingsUpdateInput, db: Db = prisma) {
    return db.notificationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.NotificationSettingsCreateInput) },
      update: data,
    });
  },

  getSystemSettings(db: Db = prisma) {
    return db.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  },

  updateSystemSettings(data: Prisma.SystemSettingsUpdateInput, db: Db = prisma) {
    return db.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.SystemSettingsCreateInput) },
      update: data,
    });
  },
};
