import "server-only";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  APP_URL: z.url().default("http://localhost:3000"),
  DEVICE_TOKEN_SECRET: z.string().min(16, "DEVICE_TOKEN_SECRET must be at least 16 characters"),
  MOBILE_API_KEY: z.string().min(8, "MOBILE_API_KEY must be at least 8 characters"),
  ALLOW_TEST_COMPANY_ID: booleanFromString,
  TRUST_PROXY: booleanFromString,
  MOBILE_EVENTS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MOBILE_CAMPAIGNS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parsed lazily so that builds without runtime secrets still succeed. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.STORAGE_DRIVER === "s3") {
    const missing = (["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"] as const).filter(
      (key) => !parsed.data[key],
    );
    if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}
