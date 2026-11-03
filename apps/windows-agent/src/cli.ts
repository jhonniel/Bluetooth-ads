import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { parseArgs } from "node:util";
import { Agent } from "./agent";
import { StationApiClient } from "./api-client";
import { agentConfigSchema, helperPath, loadConfig, saveConfig, type AgentConfig } from "./config";
import { CredentialStore } from "./credentials";
import { JsonLogger } from "./logger";
import { NativeHelper } from "./native-helper";
import { AGENT_VERSION, agentHome, paths } from "./paths";

const USAGE = `Beacon Ads Windows advertising agent ${AGENT_VERSION}

Usage:
  bpa-agent enroll --server <url> --station <code> --token <token> [--helper <path>] [--allow-insecure-http]
  bpa-agent run                 Run the agent in the foreground (used by the scheduled task)
  bpa-agent status              Show configuration and test the server connection
  bpa-agent stop                Ask a running agent to stop advertising and exit gracefully
  bpa-agent unenroll            Remove the stored credential and configuration
  bpa-agent version`;

const userAgent = () => `bpa-agent/${AGENT_VERSION} (${os.platform()} ${os.release()})`;

function client(config: AgentConfig, token: string) {
  return new StationApiClient(config.serverUrl, token, { timeoutMs: config.requestTimeoutMs, userAgent: userAgent() });
}

async function enroll(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      server: { type: "string" },
      station: { type: "string" },
      token: { type: "string" },
      helper: { type: "string" },
      "allow-insecure-http": { type: "boolean", default: false },
    },
  });
  if (!values.server || !values.station || !values.token) throw new Error("enroll requires --server, --station and --token.");

  const config = agentConfigSchema.parse({
    serverUrl: values.server,
    stationCode: values.station.toUpperCase(),
    helperPath: values.helper,
    allowInsecureHttp: values["allow-insecure-http"],
  });
  const logger = new JsonLogger("info", null);

  // Verify the credential belongs to this station before storing anything.
  const remote = await client(config, values.token).config();
  if (remote.station.code !== config.stationCode) {
    throw new Error(`The token belongs to station ${remote.station.code}, not ${config.stationCode}.`);
  }

  const helper = new NativeHelper(helperPath(config), logger);
  try {
    await new CredentialStore(helper, logger).save(values.token);
  } finally {
    await helper.close();
  }
  saveConfig(config);
  console.log(`Enrolled as station ${remote.station.code} (${remote.station.name}). Credential stored with Windows DPAPI in ${agentHome()}.`);
  if (remote.bluetooth.configError) console.warn(`Server reports a configuration problem: ${remote.bluetooth.configError}`);
}

async function run() {
  const config = loadConfig();
  const logger = new JsonLogger(config.logLevel, paths.logs());
  const helper = new NativeHelper(helperPath(config), logger);
  const token = await new CredentialStore(helper, logger).load();

  const controller = new AbortController();
  const stop = (reason: string) => {
    if (controller.signal.aborted) return;
    logger.info("stop requested", { reason });
    controller.abort();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"] as const) process.on(signal, () => stop(signal));

  // Scheduled tasks cannot deliver console signals, so "bpa-agent stop" drops a request file.
  rmSync(paths.stopRequest(), { force: true });
  const watcher = setInterval(() => {
    if (existsSync(paths.stopRequest())) {
      rmSync(paths.stopRequest(), { force: true });
      stop("stop request file");
    }
  }, 2000);

  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception", { error });
    stop("uncaught exception");
  });
  process.on("unhandledRejection", (error) => logger.error("unhandled rejection", { error }));

  const agent = new Agent({
    api: client(config, token),
    advertiser: helper,
    logger,
    version: AGENT_VERSION,
    hostname: os.hostname(),
    osVersion: `${os.version()} (${os.release()})`,
    signal: controller.signal,
  });
  try {
    await agent.run();
  } finally {
    clearInterval(watcher);
  }
}

async function status() {
  const config = loadConfig();
  const logger = new JsonLogger("warn", null);
  console.log(JSON.stringify({ home: agentHome(), serverUrl: config.serverUrl, stationCode: config.stationCode, helper: helperPath(config) }, null, 2));
  const helper = new NativeHelper(helperPath(config), logger);
  try {
    const token = await new CredentialStore(helper, logger).load();
    const remote = await client(config, token).config();
    console.log(`Server reachable. Station: ${remote.station.name}; advertising ${remote.bluetooth.advertisingEnabled ? "enabled" : "disabled"}.`);
    console.log("Bluetooth capabilities:", JSON.stringify(await helper.capabilities()));
  } finally {
    await helper.close();
  }
}

function requestStop() {
  mkdirSync(agentHome(), { recursive: true });
  writeFileSync(paths.stopRequest(), new Date().toISOString());
  console.log("Stop requested. The agent stops advertising and exits within a few seconds.");
}

function unenroll() {
  rmSync(paths.credential(), { force: true });
  rmSync(paths.config(), { force: true });
  console.log("Credential and configuration removed. Revoke the credential in the dashboard as well.");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "enroll":
      return enroll(rest);
    case "run":
      return run();
    case "status":
      return status();
    case "stop":
      return requestStop();
    case "unenroll":
      return unenroll();
    case "version":
    case "--version":
      return console.log(AGENT_VERSION);
    default:
      console.log(USAGE);
      if (command && command !== "help" && command !== "--help") process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
