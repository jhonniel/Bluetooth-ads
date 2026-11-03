import { beaconIdentifierSchema, mobileCampaignQuerySchema } from "@bpa/shared";
import { handle, ok, readQuery } from "@/lib/api-response";
import { env } from "@/lib/env";
import { clientIp, rateLimiter } from "@/lib/rate-limit";
import { NO_STORE, requireMobileApiKey } from "@/server/http";
import { mobileService } from "@/server/services/mobile-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ beaconId: string }> };

export const GET = handle("mobile.campaigns", async (request: Request, context: Context) => {
  requireMobileApiKey(request);
  rateLimiter("mobile-campaigns", env().MOBILE_CAMPAIGNS_RATE_LIMIT_PER_MINUTE, 60_000).enforce(clientIp(request.headers));
  const beaconId = beaconIdentifierSchema.parse((await context.params).beaconId);
  const query = readQuery(request, mobileCampaignQuerySchema);
  return ok(await mobileService.campaignsForBeacon(beaconId, query), NO_STORE);
});
