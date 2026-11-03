import { mobileEventsRequestSchema } from "@bpa/shared";
import { handle, ok, readJson } from "@/lib/api-response";
import { env } from "@/lib/env";
import { clientIp, rateLimiter } from "@/lib/rate-limit";
import { NO_STORE, requireMobileApiKey } from "@/server/http";
import { mobileService } from "@/server/services/mobile-service";

export const dynamic = "force-dynamic";

export const POST = handle("mobile.events", async (request: Request) => {
  requireMobileApiKey(request);
  rateLimiter("mobile-events", env().MOBILE_EVENTS_RATE_LIMIT_PER_MINUTE, 60_000).enforce(clientIp(request.headers));
  const body = await readJson(request, mobileEventsRequestSchema);
  return ok(await mobileService.recordEvents(body.events), { status: 202, ...NO_STORE });
});
