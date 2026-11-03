import { handle, ok } from "@/lib/api-response";
import { NO_STORE } from "@/server/http";
import { stationAgentService } from "@/server/services/station-agent-service";

export const dynamic = "force-dynamic";

export const GET = handle("stations.config", async (request: Request) => {
  const station = await stationAgentService.authenticate(request);
  return ok(await stationAgentService.config(station), NO_STORE);
});
