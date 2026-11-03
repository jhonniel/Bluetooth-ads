import "server-only";
import { advertisementInputSchema, type AdvertisementInput } from "@bpa/shared";
import { prisma, type Db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { paginate, type PageRequest } from "@/lib/pagination";
import { advertisementRepository } from "@/server/repositories/advertisement-repository";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { auditService } from "./audit-service";
import type { CurrentUser } from "@/server/authz";

export const advertisementService = {
  async list(q: string | undefined, page: PageRequest) {
    const { items, total } = await advertisementRepository.list({ q }, page);
    return paginate(items, total, page);
  },

  search(q: string) {
    return advertisementRepository.search(q.trim().slice(0, 100), 20);
  },

  async get(uuid: string) {
    const advertisement = await advertisementRepository.findByUuid(uuid);
    if (!advertisement) throw new NotFoundError("Advertisement not found.");
    return advertisement;
  },

  campaignsUsing(id: number) {
    return advertisementRepository.campaignsUsing(id, 50);
  },

  async create(actor: CurrentUser, input: AdvertisementInput, db: Db = prisma) {
    const data = advertisementInputSchema.parse(input);
    const advertisement = await advertisementRepository.create(data, db);
    await auditService.record(actor, "advertisement.created", { type: "advertisement", id: advertisement.uuid }, `Created advertisement "${data.name}"`, undefined, db);
    return advertisement;
  },

  async update(actor: CurrentUser, uuid: string, input: AdvertisementInput) {
    const data = advertisementInputSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const existing = await advertisementRepository.findByUuid(uuid, tx);
      if (!existing) throw new NotFoundError("Advertisement not found.");
      const advertisement = await advertisementRepository.update(existing.id, data, tx);
      // Content is fetched by the mobile app; agents only need a nudge if they cache campaign data.
      await stationRepository.bumpConfigRevision(await campaignRepository.stationIdsForAdvertisement(existing.id, tx), tx);
      await auditService.record(actor, "advertisement.updated", { type: "advertisement", id: uuid }, `Updated advertisement "${data.name}"`, undefined, tx);
      return advertisement;
    });
  },

  async remove(actor: CurrentUser, uuid: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await advertisementRepository.findByUuid(uuid, tx);
      if (!existing) throw new NotFoundError("Advertisement not found.");
      const blocking = await advertisementRepository.countBlockingCampaigns(existing.id, tx);
      if (blocking > 0) {
        throw new ConflictError(
          `This advertisement is used by ${blocking} campaign${blocking === 1 ? "" : "s"} that are not archived or expired. Reassign or archive them first.`,
        );
      }
      await advertisementRepository.softDelete(existing.id, tx);
      await auditService.record(actor, "advertisement.deleted", { type: "advertisement", id: uuid }, `Deleted advertisement "${existing.name}"`, undefined, tx);
    });
  },
};
