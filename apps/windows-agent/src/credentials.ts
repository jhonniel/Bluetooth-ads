import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { agentHome, paths } from "./paths";
import type { Logger } from "./logger";
import type { NativeHelper } from "./native-helper";

/**
 * Station tokens are encrypted with Windows DPAPI (machine scope plus application entropy) by the
 * native helper and stored in %ProgramData%\BpaAgent\credential.bin. The installer restricts the
 * directory ACL to SYSTEM, Administrators and the configured service account.
 *
 * BPA_STATION_TOKEN can be used for development; it bypasses DPAPI and is logged as a warning.
 */
export class CredentialStore {
  constructor(
    private readonly helper: NativeHelper,
    private readonly logger: Logger,
  ) {}

  async save(token: string): Promise<void> {
    const protectedBase64 = await this.helper.protect(token);
    mkdirSync(agentHome(), { recursive: true });
    writeFileSync(paths.credential(), protectedBase64, { encoding: "utf8" });
  }

  async load(): Promise<string> {
    if (process.env.BPA_STATION_TOKEN) {
      this.logger.warn("using station token from BPA_STATION_TOKEN environment variable (development only)");
      return process.env.BPA_STATION_TOKEN.trim();
    }
    if (!existsSync(paths.credential())) {
      throw new Error(`No station credential found at ${paths.credential()}. Run "bpa-agent enroll" first.`);
    }
    return this.helper.unprotect(readFileSync(paths.credential(), "utf8").trim());
  }

  clear(): void {
    rmSync(paths.credential(), { force: true });
  }
}
