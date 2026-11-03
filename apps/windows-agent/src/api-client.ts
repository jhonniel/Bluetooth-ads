import { z } from "zod";
import {
  activeCampaignResponseSchema,
  stationCommandsResponseSchema,
  stationConfigResponseSchema,
  stationHeartbeatResponseSchema,
  type StationCommandExecuteRequest,
  type StationHeartbeatRequest,
  type StationRegisterRequest,
} from "@bpa/shared";

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }

  /** The credential was revoked, expired or the station was removed. */
  get isAuthFailure() {
    return this.status === 401;
  }
}

/** True for failures worth retrying: network errors, timeouts, rate limits and server errors. */
export function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500;
  return true;
}

/** Typed client for the station API. Every response is validated against the shared schemas. */
export class StationApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly options: { timeoutMs: number; userAgent: string },
  ) {}

  private async request<S extends z.ZodType>(method: "GET" | "POST", path: string, schema: S, body?: unknown): Promise<z.output<S>> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "User-Agent": this.options.userAgent,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.options.timeoutMs),
      redirect: "error",
    });
    const text = await response.text();
    let json: { data?: unknown; error?: { code?: string; message?: string } } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError(response.status, "invalid_response", `Server returned non-JSON response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new ApiError(response.status, json.error?.code ?? "http_error", json.error?.message ?? `HTTP ${response.status}`);
    }
    return schema.parse(json.data);
  }

  register(body: StationRegisterRequest) {
    return this.request("POST", "/api/stations/register", stationConfigResponseSchema, body);
  }

  config() {
    return this.request("GET", "/api/stations/config", stationConfigResponseSchema);
  }

  heartbeat(body: StationHeartbeatRequest) {
    return this.request("POST", "/api/stations/heartbeat", stationHeartbeatResponseSchema, body);
  }

  commands() {
    return this.request("GET", "/api/stations/commands", stationCommandsResponseSchema);
  }

  executeCommand(body: StationCommandExecuteRequest) {
    return this.request("POST", "/api/stations/commands/execute", z.object({ id: z.string(), status: z.string() }), body);
  }

  activeCampaign() {
    return this.request("GET", "/api/stations/campaigns/active", activeCampaignResponseSchema);
  }
}

export type StationApi = Pick<StationApiClient, "register" | "config" | "heartbeat" | "commands" | "executeCommand" | "activeCampaign">;
