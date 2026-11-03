#!/usr/bin/env node
/**
 * End-to-end smoke test for the station and mobile APIs against a running server.
 *
 *   BASE_URL=http://localhost:3000 STATION_TOKEN=bpa_st_... MOBILE_API_KEY=... node scripts/smoke-test.mjs [--report-events]
 *
 * It acts as an API client only: it reports bluetoothStatus "STOPPED" (never ADVERTISING) and ends
 * with a shutdown heartbeat so the station is shown as offline again. Analytics events are only
 * posted with --report-events, tagged appVersion "smoke-test".
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const STATION_TOKEN = process.env.STATION_TOKEN;
const MOBILE_API_KEY = process.env.MOBILE_API_KEY;
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? `smoke-${Date.now().toString(36)}-device`;
const REPORT_EVENTS = process.argv.includes("--report-events");

if (!STATION_TOKEN || !MOBILE_API_KEY) {
  console.error("STATION_TOKEN and MOBILE_API_KEY are required.");
  process.exit(2);
}

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures++;
}

async function call(method, path, { headers = {}, body } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const station = (method, path, body) => call(method, path, { headers: { Authorization: `Bearer ${STATION_TOKEN}` }, body });
const mobile = (method, path, body) => call(method, path, { headers: { "x-api-key": MOBILE_API_KEY }, body });

const health = await call("GET", "/api/health");
check("health endpoint", health.status === 200 && health.json?.status === "ok");

const unauthorized = await call("GET", "/api/stations/config", { headers: { Authorization: "Bearer bpa_st_invalid" } });
check("station API rejects invalid token", unauthorized.status === 401);

const registered = await station("POST", "/api/stations/register", { softwareVersion: "smoke-test", hostname: "smoke-test", capabilities: null });
check("station register", registered.status === 200, registered.json?.data?.station?.code);
const beaconId = registered.json?.data?.bluetooth?.beaconIdentifier;

const config = await station("GET", "/api/stations/config");
check("station config", config.status === 200 && config.json?.data?.bluetooth?.beaconIdentifier === beaconId);

const heartbeat = await station("POST", "/api/stations/heartbeat", {
  status: "ONLINE",
  bluetoothStatus: "STOPPED",
  bluetoothError: "Smoke test client (no Bluetooth hardware).",
  advertising: { active: false },
  softwareVersion: "smoke-test",
});
check("station heartbeat", heartbeat.status === 200, `pending commands: ${heartbeat.json?.data?.pendingCommands}`);

const active = await station("GET", "/api/stations/campaigns/active");
check("active campaign", active.status === 200, active.json?.data?.campaign?.name ?? active.json?.data?.reason);
if (active.json?.data?.beacon) {
  const beacon = active.json.data.beacon;
  check("beacon payload fits legacy advertising", beacon.totalAdvertisingBytes <= 31, `${beacon.totalAdvertisingBytes} bytes, data ${beacon.dataHex}`);
}

const commands = await station("GET", "/api/stations/commands");
check("command poll", commands.status === 200, `${commands.json?.data?.commands?.length ?? 0} outstanding`);

const noKey = await call("GET", `/api/mobile/campaigns/${beaconId}`);
check("mobile API requires API key", noKey.status === 401);

const campaigns = await mobile("GET", `/api/mobile/campaigns/${beaconId}?device=${DEVICE_TOKEN}&rssi=-60`);
const list = campaigns.json?.data?.campaigns ?? [];
check("mobile campaigns for beacon", campaigns.status === 200, `${list.length} live campaign(s)`);

const unknown = await mobile("GET", "/api/mobile/campaigns/00000000-0000-4000-8000-000000000000");
check("unknown beacon returns 404", unknown.status === 404);

if (REPORT_EVENTS && list.length) {
  const campaignId = list[0].id;
  const base = { campaignId, beaconId, deviceToken: DEVICE_TOKEN, platform: "android", appVersion: "smoke-test" };
  const events = await mobile("POST", "/api/mobile/events", {
    events: [
      { ...base, type: "beacon_detected", rssi: -60 },
      { ...base, type: "notification_displayed", rssi: -60 },
      { ...base, type: "notification_displayed", rssi: -60 },
    ],
  });
  check("event reporting", events.status === 202 && events.json?.data?.accepted === 2 && events.json?.data?.duplicates === 1, JSON.stringify(events.json?.data));
  const after = await mobile("GET", `/api/mobile/campaigns/${beaconId}?device=${DEVICE_TOKEN}&rssi=-60`);
  const reason = after.json?.data?.campaigns?.find((c) => c.id === campaignId)?.eligibility?.reason;
  check("frequency capping applies after display", reason !== "ok", reason);
} else {
  console.log("SKIP  event reporting (pass --report-events to post tagged test events)");
}

const shutdown = await station("POST", "/api/stations/heartbeat", {
  status: "ONLINE",
  bluetoothStatus: "STOPPED",
  advertising: { active: false },
  softwareVersion: "smoke-test",
  shuttingDown: true,
});
check("shutdown heartbeat", shutdown.status === 200);

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
