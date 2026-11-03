import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = /token|secret|password|authorization/i;
const RETENTION_DAYS = 14;

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]));
}

/** Structured JSON-lines logger writing to stdout and a daily file with automatic retention. */
export class JsonLogger implements Logger {
  private currentDay = "";
  private file: string | null = null;

  constructor(
    private readonly level: LogLevel,
    private readonly directory: string | null,
  ) {
    if (directory) {
      mkdirSync(directory, { recursive: true });
      this.prune();
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.write("debug", message, context);
  }
  info(message: string, context?: Record<string, unknown>) {
    this.write("info", message, context);
  }
  warn(message: string, context?: Record<string, unknown>) {
    this.write("warn", message, context);
  }
  error(message: string, context?: Record<string, unknown>) {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (ORDER[level] < ORDER[this.level]) return;
    const now = new Date();
    const line = JSON.stringify({ ts: now.toISOString(), level, msg: message, ...(context ? (redact(context) as object) : {}) });
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
    if (!this.directory) return;
    const day = now.toISOString().slice(0, 10);
    if (day !== this.currentDay) {
      this.currentDay = day;
      this.file = path.join(this.directory, `agent-${day}.log`);
      this.prune();
    }
    try {
      appendFileSync(this.file!, line + "\n");
    } catch {
      // Logging must never crash the agent (e.g. disk full).
    }
  }

  private prune() {
    if (!this.directory) return;
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    try {
      for (const name of readdirSync(this.directory)) {
        if (!/^agent-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
        const full = path.join(this.directory, name);
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
      }
    } catch {
      // Best effort.
    }
  }
}
