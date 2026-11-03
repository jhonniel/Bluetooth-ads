import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

const IMAGE_TYPES = [
  { ext: "png", mime: "image/png", test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", test: (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
] as const;

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(IMAGE_TYPES.map((t) => [t.ext, t.mime]));

let s3: S3Client | null = null;
function s3Client(): S3Client {
  const config = env();
  s3 ??= new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: false,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
  });
  return s3;
}

function localRoot(): string {
  return path.resolve(process.cwd(), env().STORAGE_LOCAL_DIR);
}

export const storageService = {
  /**
   * Stores a promotional image. Type is detected from file content, not the client-provided name.
   * SVG is rejected because it can carry scripts. Promotional images are public by design (they are
   * shown in customer notifications), so they are stored with public read access.
   */
  async storeImage(file: File): Promise<{ url: string }> {
    const maxBytes = env().MAX_UPLOAD_BYTES;
    if (file.size === 0) throw new ValidationError("The file is empty.");
    if (file.size > maxBytes) throw new ValidationError(`Images must be ${Math.round(maxBytes / 1024)} KB or smaller.`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const type = IMAGE_TYPES.find((candidate) => candidate.test(buffer));
    if (!type) throw new ValidationError("Only PNG, JPEG and WebP images are supported.");

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;

    if (env().STORAGE_DRIVER === "s3") {
      await s3Client().send(
        new PutObjectCommand({
          Bucket: env().S3_BUCKET,
          Key: `media/${key}`,
          Body: buffer,
          ContentType: type.mime,
          ACL: "public-read",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return { url: `${env().S3_PUBLIC_BASE_URL!.replace(/\/$/, "")}/media/${key}` };
    }

    const target = path.join(localRoot(), key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
    return { url: `/media/${key}` };
  },

  /** Reads a locally stored file. Returns null for unknown or out-of-root paths. */
  async readLocal(segments: string[]): Promise<{ body: Buffer; contentType: string } | null> {
    if (segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s === "..")) return null;
    const root = localRoot();
    const target = path.resolve(root, ...segments);
    if (!target.startsWith(root + path.sep)) return null;
    const contentType = MIME_BY_EXT[path.extname(target).slice(1).toLowerCase()];
    if (!contentType) return null;
    try {
      return { body: await readFile(target), contentType };
    } catch {
      return null;
    }
  },

  /** Mobile clients need absolute URLs for locally served media. */
  toAbsoluteUrl(url: string | null): string | null {
    if (!url) return null;
    return url.startsWith("/") ? `${env().APP_URL.replace(/\/$/, "")}${url}` : url;
  },
};
