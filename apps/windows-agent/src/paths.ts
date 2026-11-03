import os from "node:os";
import path from "node:path";

declare const __AGENT_VERSION__: string | undefined;

export const AGENT_VERSION = typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "1.0.0-dev";

/** Data directory for configuration, protected credentials and logs. */
export function agentHome(): string {
  if (process.env.BPA_AGENT_HOME) return path.resolve(process.env.BPA_AGENT_HOME);
  const programData = process.env.ProgramData ?? (process.platform === "win32" ? "C:\\ProgramData" : path.join(os.homedir(), ".bpa-agent"));
  return path.join(programData, "BpaAgent");
}

export const paths = {
  config: () => path.join(agentHome(), "config.json"),
  credential: () => path.join(agentHome(), "credential.bin"),
  logs: () => path.join(agentHome(), "logs"),
  stopRequest: () => path.join(agentHome(), "stop.request"),
  /** The native helper ships next to the bundled agent in native/BpaBleHelper.exe. */
  defaultHelper: () => path.join(path.dirname(process.argv[1] ?? process.cwd()), "native", "BpaBleHelper.exe"),
};
