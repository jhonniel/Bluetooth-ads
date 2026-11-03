import "server-only";
import type { CampaignStatus } from "@prisma/client";
import {
  campaignInputSchema,
  campaignPatchSchema,
  type AdvertisementInput,
  type CampaignInput,
} from "@bpa/shared";
import { prisma, type Db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginate, type PageRequest } from "@/lib/pagination";
import { effectiveCampaignStatus, statusAfterScheduleChange, statusOnActivate } from "@/server/domain/campaign-rules";
import { advertisementRepository } from "@/server/repositories/advertisement-repository";
import { campaignRepository, type CampaignWithDetails } from "@/server/repositories/campaign-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { advertisementService } from "./advertisement-service";
import { auditService } from "./audit-service";
import type { CurrentUser } from "@/server/authz";

export interface CampaignSaveRequest {
  campaign: CampaignInput;
  /** Creates a reusable advertisement in the same transaction instead of referencing an existing one. */
  newAdvertisement?: AdvertisementInput | null;
  activate?: boolean;
}

async function resolveStations(codes: string[], db: Db) {
  const unique = [...new Set(codes)];
  const stations = await stationRepository.findManyByCodes(unique, db);
  if (stations.length !== unique.length) {
    const found = new Set(stations.map((s) => s.stationCode));
    const missing = unique.filter((code) => !found.has(code));
    throw new ValidationError(`Unknown stations: ${missing.join(", ")}`, { stationCodes: ["One or more stations no longer exist."] });
  }
  return stations.map((s) => s.id);
}

async function resolveAdvertisementId(actor: CurrentUser, request: CampaignSaveRequest, advertisementUuid: string | null, db: Db) {
  if (request.newAdvertisement) {
    const created = await advertisementService.create(actor, request.newAdvertisement, db);
    return created.id;
  }
  if (!advertisementUuid) return null;
  const advertisement = await advertisementRepository.findByUuid(advertisementUuid, db);
  if (!advertisement) throw new ValidationError("Selected advertisement no longer exists.", { advertisementId: ["Select an advertisement."] });
  return advertisement.id;
}

function assertActivatable(campaign: { advertisementId: number | null; startAt: Date | null; endAt: Date | null }, stationCount: number, now: Date) {
  if (!campaign.advertisementId) throw new ConflictError("Attach an advertisement before activating the campaign.");
  if (stationCount === 0) throw new ConflictError("Assign at least one Bluetooth station before activating the campaign.");
  try {
    return statusOnActivate(campaign, now);
  } catch (error) {
    throw new ConflictError((error as Error).message);
  }
}

export function toCampaignDto(campaign: CampaignWithDetails, now = new Date()) {
  return {
    id: campaign.uuid,
    name: campaign.name,
    description: campaign.description,
    status: effectiveCampaignStatus(campaign, now),
    beaconKey: campaign.beaconKey,
    priority: campaign.priority,
    startAt: campaign.startAt?.toISOString() ?? null,
    endAt: campaign.endAt?.toISOString() ?? null,
    cooldownMinutes: campaign.cooldownMinutes,
    maxNotificationsPerDay: campaign.maxNotificationsPerDay,
    advertisement: campaign.advertisement
      ? {
          id: campaign.advertisement.uuid,
          name: campaign.advertisement.name,
          title: campaign.advertisement.title,
          message: campaign.advertisement.message,
          imageUrl: campaign.advertisement.imageUrl,
          landingUrl: campaign.advertisement.landingUrl,
          ctaLabel: campaign.advertisement.ctaLabel,
        }
      : null,
    stations: campaign.stations.map(({ station }) => ({ code: station.stationCode, name: station.name, location: station.location })),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export const campaignService = {
  async list(filter: { q?: string; status?: CampaignStatus }, page: PageRequest) {
    await campaignRepository.syncScheduledStatuses();
    const { items, total } = await campaignRepository.list(filter, page);
    return paginate(items, total, page);
  },

  search(q: string) {
    return campaignRepository.search(q.trim().slice(0, 100), 20);
  },

  async get(uuid: string) {
    await campaignRepository.syncScheduledStatuses();
    const campaign = await campaignRepository.findByUuid(uuid);
    if (!campaign) throw new NotFoundError("Campaign not found.");
    return campaign;
  },

  async create(actor: CurrentUser, request: CampaignSaveRequest) {
    const data = campaignInputSchema.parse(request.campaign);
    const now = new Date();
    const uuid = await prisma.$transaction(async (tx) => {
      const stationIds = await resolveStations(data.stationCodes, tx);
      const advertisementId = await resolveAdvertisementId(actor, request, data.advertisementId, tx);
      const fields = {
        name: data.name,
        description: data.description,
        advertisementId,
        startAt: data.startAt,
        endAt: data.endAt,
        priority: data.priority,
        cooldownMinutes: data.cooldownMinutes,
        maxNotificationsPerDay: data.maxNotificationsPerDay,
      };
      const status: CampaignStatus = request.activate ? assertActivatable(fields, stationIds.length, now) : "DRAFT";
      const campaign = await campaignRepository.create({ ...fields, createdById: actor.id }, tx);
      if (status !== "DRAFT") await campaignRepository.update(campaign.id, { status }, tx);
      await campaignRepository.replaceStations(campaign.id, stationIds, tx);
      await stationRepository.bumpConfigRevision(stationIds, tx);
      await auditService.record(
        actor,
        "campaign.created",
        { type: "campaign", id: campaign.uuid },
        `Created campaign "${campaign.name}" (${status.toLowerCase()})`,
        { stations: data.stationCodes },
        tx,
      );
      return campaign.uuid;
    });
    return this.get(uuid);
  },

  async update(actor: CurrentUser, uuid: string, request: CampaignSaveRequest) {
    const data = campaignInputSchema.parse(request.campaign);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const existing = await campaignRepository.findByUuid(uuid, tx);
      if (!existing) throw new NotFoundError("Campaign not found.");
      if (existing.status === "ARCHIVED") throw new ConflictError("Archived campaigns cannot be edited.");

      const stationIds = await resolveStations(data.stationCodes, tx);
      const advertisementId = await resolveAdvertisementId(actor, request, data.advertisementId, tx);
      const fields = {
        name: data.name,
        description: data.description,
        advertisementId,
        startAt: data.startAt,
        endAt: data.endAt,
        priority: data.priority,
        cooldownMinutes: data.cooldownMinutes,
        maxNotificationsPerDay: data.maxNotificationsPerDay,
      };
      let status = statusAfterScheduleChange({ status: existing.status, startAt: data.startAt, endAt: data.endAt }, now);
      if (request.activate) status = assertActivatable(fields, stationIds.length, now);
      if ((status === "ACTIVE" || status === "SCHEDULED") && (!advertisementId || stationIds.length === 0)) {
        throw new ConflictError("A running campaign needs an advertisement and at least one station. Pause it first to remove them.");
      }

      const previousStationIds = existing.stations.map((s) => s.stationId);
      await campaignRepository.update(existing.id, { ...fields, status }, tx);
      await campaignRepository.replaceStations(existing.id, stationIds, tx);
      await stationRepository.clearTargetCampaign(existing.id, stationIds, tx);
      await stationRepository.bumpConfigRevision([...new Set([...previousStationIds, ...stationIds])], tx);
      await auditService.record(actor, "campaign.updated", { type: "campaign", id: uuid }, `Updated campaign "${data.name}"`, { stations: data.stationCodes, status }, tx);
    });
    return this.get(uuid);
  },

  /** Partial update used by the REST API. */
  async patch(actor: CurrentUser, uuid: string, body: unknown) {
    const patch = campaignPatchSchema.parse(body);
    const existing = await this.get(uuid);
    const hasFieldChanges = Object.entries(patch).some(([key, value]) => key !== "action" && value !== undefined);
    if (hasFieldChanges) {
      await this.update(actor, uuid, {
        campaign: {
          name: patch.name ?? existing.name,
          description: patch.description !== undefined ? patch.description : existing.description,
          advertisementId: patch.advertisementId !== undefined ? patch.advertisementId : (existing.advertisement?.uuid ?? null),
          startAt: patch.startAt !== undefined ? patch.startAt : existing.startAt,
          endAt: patch.endAt !== undefined ? patch.endAt : existing.endAt,
          priority: patch.priority ?? existing.priority,
          cooldownMinutes: patch.cooldownMinutes !== undefined ? patch.cooldownMinutes : existing.cooldownMinutes,
          maxNotificationsPerDay: patch.maxNotificationsPerDay !== undefined ? patch.maxNotificationsPerDay : existing.maxNotificationsPerDay,
          stationCodes: patch.stationCodes ?? existing.stations.map((s) => s.station.stationCode),
        },
      });
    }
    if (patch.action === "activate") return this.activate(actor, uuid);
    if (patch.action === "pause") return this.pause(actor, uuid);
    if (patch.action === "archive") return this.archive(actor, uuid);
    return this.get(uuid);
  },

  async activate(actor: CurrentUser, uuid: string) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const campaign = await campaignRepository.findByUuid(uuid, tx);
      if (!campaign) throw new NotFoundError("Campaign not found.");
      if (campaign.status === "ARCHIVED") throw new ConflictError("Archived campaigns cannot be activated.");
      const status = assertActivatable(campaign, campaign.stations.length, now);
      await campaignRepository.update(campaign.id, { status }, tx);
      await stationRepository.bumpConfigRevision(campaign.stations.map((s) => s.stationId), tx);
      await auditService.record(actor, "campaign.activated", { type: "campaign", id: uuid }, `Activated campaign "${campaign.name}" (${status.toLowerCase()})`, undefined, tx);
    });
    return this.get(uuid);
  },

  async pause(actor: CurrentUser, uuid: string) {
    return this.transition(actor, uuid, "PAUSED", ["ACTIVE", "SCHEDULED"], "campaign.paused", "Paused");
  },

  async archive(actor: CurrentUser, uuid: string) {
    return this.transition(actor, uuid, "ARCHIVED", ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "EXPIRED"], "campaign.archived", "Archived");
  },

  async transition(actor: CurrentUser, uuid: string, to: CampaignStatus, from: CampaignStatus[], action: string, verb: string) {
    await prisma.$transaction(async (tx) => {
      const campaign = await campaignRepository.findByUuid(uuid, tx);
      if (!campaign) throw new NotFoundError("Campaign not found.");
      if (!from.includes(campaign.status)) {
        throw new ConflictError(`A ${campaign.status.toLowerCase()} campaign cannot be ${verb.toLowerCase()}.`);
      }
      await campaignRepository.update(campaign.id, { status: to }, tx);
      await stationRepository.bumpConfigRevision(campaign.stations.map((s) => s.stationId), tx);
      await auditService.record(actor, action, { type: "campaign", id: uuid }, `${verb} campaign "${campaign.name}"`, undefined, tx);
    });
    return this.get(uuid);
  },

  /** Soft delete: the campaign disappears from the dashboard and stops serving, but analytics history is kept. */
  async remove(actor: CurrentUser, uuid: string) {
    await prisma.$transaction(async (tx) => {
      const campaign = await campaignRepository.findByUuid(uuid, tx);
      if (!campaign) throw new NotFoundError("Campaign not found.");
      await campaignRepository.softDelete(campaign.id, tx);
      await stationRepository.clearTargetCampaign(campaign.id, [], tx);
      await stationRepository.bumpConfigRevision(campaign.stations.map((s) => s.stationId), tx);
      await auditService.record(actor, "campaign.deleted", { type: "campaign", id: uuid }, `Deleted campaign "${campaign.name}"`, undefined, tx);
    });
  },
};
