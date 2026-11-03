import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { BluetoothCapabilities } from "@bpa/shared";
import type { Logger } from "./logger";

/** Windows BluetoothLEAdvertisementPublisherStatus values reported by the helper. */
export type PublisherStatus = "None" | "Created" | "Waiting" | "Started" | "Stopping" | "Stopped" | "Aborted";

export interface PublisherStatusEvent {
  status: PublisherStatus;
  /** Windows BluetoothError name, e.g. "Success", "RadioNotAvailable", "ResourceInUse". */
  error: string | null;
  selectedTxPowerDbm: number | null;
}

export interface StartAdvertisingRequest {
  companyId: number;
  dataHex: string;
  txPowerDbm: number | null;
}

/** Abstraction over the native advertiser so orchestration logic can be tested without hardware. */
export interface BleAdvertiser {
  capabilities(): Promise<BluetoothCapabilities>;
  startAdvertising(request: StartAdvertisingRequest): Promise<{ status: PublisherStatus }>;
  stopAdvertising(): Promise<void>;
  onStatus(listener: (event: PublisherStatusEvent) => void): void;
  onExit(listener: (code: number | null) => void): void;
  close(): Promise<void>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class NativeHelperError extends Error {
  override name = "NativeHelperError";
}

/**
 * Talks to BpaBleHelper.exe (C#/.NET, WinRT BluetoothLEAdvertisementPublisher) over JSON lines on
 * stdin/stdout. The helper stops advertising and exits when stdin closes, so a crashed or killed
 * agent never leaves an orphaned broadcast.
 */
export class NativeHelper implements BleAdvertiser {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly events = new EventEmitter();
  private nextId = 1;

  constructor(
    private readonly executable: string,
    private readonly logger: Logger,
  ) {}

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child;
    if (process.platform !== "win32") throw new NativeHelperError("BLE advertising requires Windows 10 version 2004 or later.");
    if (!existsSync(this.executable)) {
      throw new NativeHelperError(`Native BLE helper not found at ${this.executable}. Build it with "npm run build:native" on a machine with the .NET 8 SDK.`);
    }
    const child = spawn(this.executable, ["serve"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child = child;

    createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    createInterface({ input: child.stderr }).on("line", (line) => this.logger.warn("native helper stderr", { line }));
    child.on("error", (error) => this.logger.error("native helper failed to start", { error }));
    child.on("exit", (code) => {
      this.child = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new NativeHelperError(`Native helper exited (code ${code}) before answering.`));
        this.pending.delete(id);
      }
      this.events.emit("exit", code);
    });
    this.logger.info("native helper started", { pid: child.pid });
    return child;
  }

  private handleLine(line: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.logger.warn("unparseable native helper output", { line: line.slice(0, 200) });
      return;
    }
    if (message.event === "publisherStatus") {
      this.events.emit("status", {
        status: message.status as PublisherStatus,
        error: (message.error as string | null) ?? null,
        selectedTxPowerDbm: (message.selectedTxPowerDbm as number | null) ?? null,
      } satisfies PublisherStatusEvent);
      return;
    }
    const id = typeof message.id === "string" ? message.id : null;
    const pending = id ? this.pending.get(id) : undefined;
    if (!id || !pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (message.ok) pending.resolve(message.result ?? null);
    else pending.reject(new NativeHelperError(String(message.error ?? "Native helper request failed.")));
  }

  request<T>(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
    const child = this.ensureStarted();
    const id = String(this.nextId++);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new NativeHelperError(`Native helper did not answer "${cmd}" within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      child.stdin.write(JSON.stringify({ id, cmd, ...params }) + "\n");
    });
  }

  capabilities() {
    return this.request<BluetoothCapabilities>("capabilities");
  }

  startAdvertising(request: StartAdvertisingRequest) {
    return this.request<{ status: PublisherStatus }>("start", { ...request });
  }

  async stopAdvertising() {
    if (!this.child) return;
    await this.request("stop");
  }

  protect(plaintext: string) {
    return this.request<string>("protect", { data: Buffer.from(plaintext, "utf8").toString("base64") });
  }

  async unprotect(protectedBase64: string) {
    const base64 = await this.request<string>("unprotect", { data: protectedBase64 });
    return Buffer.from(base64, "base64").toString("utf8");
  }

  onStatus(listener: (event: PublisherStatusEvent) => void) {
    this.events.on("status", listener);
  }

  onExit(listener: (code: number | null) => void) {
    this.events.on("exit", listener);
  }

  async close() {
    const child = this.child;
    if (!child) return;
    try {
      await this.request("stop", {}, 3000);
    } catch {
      // Closing stdin below also stops the publisher.
    }
    child.stdin.end();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
