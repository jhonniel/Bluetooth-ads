import { stationHeartbeatRequestSchema } from "@bpa/shared";
import { handle, ok, readJson } from "@/lib/api-response";
import { NO_STORE } from "@/server/http";
import { stationAgentService } from "@/server/services/station-agent-service";

export const dynamic = "force-dynamic";

export const POST = handle("stations.heartbeat", async (request: Request) => {
  const station = await stationAgentService.authenticate(request);
  const body = await readJson(request, stationHeartbeatRequestSchema);
  return ok(await stationAgentService.heartbeat(station, body), NO_STORE);
});
