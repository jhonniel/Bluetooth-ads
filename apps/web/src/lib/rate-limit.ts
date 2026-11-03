import "server-only";
import { RateLimitError } from "./errors";
import { env } from "./env";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window rate limiter. Suitable for a single web instance; when running several
 * instances behind a load balancer, replace with a shared store (e.g. Redis) or enforce limits at the proxy.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  consume(key: string, cost = 1): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count + cost > this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += cost;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Throws RateLimitError when the key is over its limit. */
  enforce(key: string, cost = 1): void {
    const result = this.consume(key, cost);
    if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}

const globalLimiters = globalThis as unknown as { __bpaRateLimiters?: Map<string, RateLimiter> };

/** Named limiter that survives hot reloads in development. */
export function rateLimiter(name: string, limit: number, windowMs: number): RateLimiter {
  globalLimiters.__bpaRateLimiters ??= new Map();
  let limiter = globalLimiters.__bpaRateLimiters.get(name);
  if (!limiter) {
    limiter = new RateLimiter(limit, windowMs);
    globalLimiters.__bpaRateLimiters.set(name, limiter);
  }
  return limiter;
}

/** Client IP for rate limiting. Forwarded headers are only trusted when TRUST_PROXY=true. */
export function clientIp(headers: Headers): string {
  if (env().TRUST_PROXY) {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "direct";
}
