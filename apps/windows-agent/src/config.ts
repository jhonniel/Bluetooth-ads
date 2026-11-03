import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { agentHome, paths } from "./paths";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const agentConfigSchema = z
  .object({
    serverUrl: z.url(),
    stationCode: z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    helperPath: z.string().optional(),
    /** Allow plain http to non-local servers. Never enable in production: tokens would travel unencrypted. */
    allowInsecureHttp: z.boolean().default(false),
    requestTimeoutMs: z.number().int().min(2000).max(60000).default(15000),
  })
  .superRefine((value, ctx) => {
    const url = new URL(value.serverUrl);
    if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname) && !value.allowInsecureHttp) {
      ctx.addIssue({ code: "custom", path: ["serverUrl"], message: "Server URL must use https:// (http is only allowed for localhost)." });
    }
  });

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function loadConfig(): AgentConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.config(), "utf8"));
  } catch (error) {
    throw new Error(`Agent is not enrolled or ${paths.config()} is unreadable. Run "bpa-agent enroll" first. (${(error as Error).message})`);
  }
  const overrides = {
    ...(process.env.BPA_SERVER_URL ? { serverUrl: process.env.BPA_SERVER_URL } : {}),
    ...(process.env.BPA_LOG_LEVEL ? { logLevel: process.env.BPA_LOG_LEVEL } : {}),
    ...(process.env.BPA_HELPER_PATH ? { helperPath: process.env.BPA_HELPER_PATH } : {}),
  };
  return agentConfigSchema.parse({ ...(raw as object), ...overrides });
}

export function saveConfig(config: AgentConfig): void {
  mkdirSync(agentHome(), { recursive: true });
  writeFileSync(paths.config(), JSON.stringify(config, null, 2) + "\n", { encoding: "utf8" });
}

export function helperPath(config: Pick<AgentConfig, "helperPath">): string {
  return config.helperPath ? path.resolve(config.helperPath) : paths.defaultHelper();
}
