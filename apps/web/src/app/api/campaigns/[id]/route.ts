import { z } from "zod";
import { publicIdSchema } from "@bpa/shared";
import { handle, ok, readJson } from "@/lib/api-response";
import { requireApiUser } from "@/server/http";
import { campaignService, toCampaignDto } from "@/server/services/campaign-service";

export const dynamic = "force-dynamic";

/** `id` is the campaign's public UUID, never the internal primary key. */
type Context = { params: Promise<{ id: string }> };

async function campaignId(context: Context) {
  return publicIdSchema.parse((await context.params).id);
}

export const GET = handle("campaigns.get", async (_request: Request, context: Context) => {
  await requireApiUser("dashboard:read");
  return ok(toCampaignDto(await campaignService.get(await campaignId(context))));
});

export const PATCH = handle("campaigns.patch", async (request: Request, context: Context) => {
  const user = await requireApiUser("campaigns:write");
  const id = await campaignId(context);
  const body = await readJson(request, z.unknown());
  return ok(toCampaignDto(await campaignService.patch(user, id, body)));
});

export const DELETE = handle("campaigns.delete", async (_request: Request, context: Context) => {
  const user = await requireApiUser("campaigns:write");
  await campaignService.remove(user, await campaignId(context));
  return ok({ deleted: true });
});
