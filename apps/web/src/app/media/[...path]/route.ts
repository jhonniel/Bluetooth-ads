import { storageService } from "@/server/services/storage-service";

type Context = { params: Promise<{ path: string[] }> };

/** Serves locally stored promotional images (STORAGE_DRIVER=local). */
export async function GET(_request: Request, context: Context) {
  const { path } = await context.params;
  const file = await storageService.readLocal(path);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
