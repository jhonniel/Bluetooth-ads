import { z } from "zod";
import { CAMPAIGN_STATUSES, advertisementInputSchema, campaignInputSchema } from "@bpa/shared";
import { handle, ok, readJson, readQuery } from "@/lib/api-response";
import { requireApiUser } from "@/server/http";
import { campaignService, toCampaignDto } from "@/server/services/campaign-service";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createBodySchema = z.object({
  campaign: z.unknown(),
  newAdvertisement: advertisementInputSchema.nullish(),
  activate: z.boolean().optional(),
});

export const GET = handle("campaigns.list", async (request: Request) => {
  await requireApiUser("dashboard:read");
  const query = readQuery(request, listQuerySchema);
  const result = await campaignService.list({ q: query.q, status: query.status }, { page: query.page, pageSize: query.pageSize });
  return ok({
    items: result.items.map((c) => ({
      id: c.uuid,
      name: c.name,
      status: c.status,
      priority: c.priority,
      beaconKey: c.beaconKey,
      startAt: c.startAt?.toISOString() ?? null,
      endAt: c.endAt?.toISOString() ?? null,
      advertisement: c.advertisement ? { id: c.advertisement.uuid, name: c.advertisement.name } : null,
      stationCount: c._count.stations,
      updatedAt: c.updatedAt.toISOString(),
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    pageCount: result.pageCount,
  });
});

export const POST = handle("campaigns.create", async (request: Request) => {
  const user = await requireApiUser("campaigns:write");
  const body = await readJson(request, createBodySchema);
  const campaign = await campaignService.create(user, {
    campaign: campaignInputSchema.parse(body.campaign),
    newAdvertisement: body.newAdvertisement ?? null,
    activate: body.activate,
  });
  return ok(toCampaignDto(campaign), { status: 201 });
});
