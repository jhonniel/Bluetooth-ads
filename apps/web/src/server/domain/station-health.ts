import type { StationStatus } from "@bpa/shared";

export interface StationHeartbeatState {
  status: StationStatus;
  lastHeartbeat: Date | null;
}

/**
 * A stale heartbeat always means OFFLINE, because a crashed or disconnected agent cannot report
 * that it went away. A fresh heartbeat keeps the stored status (OFFLINE after a graceful shutdown).
 */
export function effectiveStationStatus(station: StationHeartbeatState, now: Date, offlineThresholdSeconds: number): StationStatus {
  if (!station.lastHeartbeat) return station.status === "CONNECTING" ? "CONNECTING" : "OFFLINE";
  if (now.getTime() - station.lastHeartbeat.getTime() > offlineThresholdSeconds * 1000) return "OFFLINE";
  return station.status;
}

export function heartbeatCutoff(now: Date, offlineThresholdSeconds: number): Date {
  return new Date(now.getTime() - offlineThresholdSeconds * 1000);
}
