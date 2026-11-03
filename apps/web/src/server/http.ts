import "server-only";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { UnauthorizedError } from "@/lib/errors";
import { getCurrentUser, requirePermission } from "@/server/authz";
import type { Permission } from "@/lib/permissions";

export const NO_STORE: ResponseInit = { headers: { "Cache-Control": "no-store" } };

/** Mobile clients identify the app with a shared API key. This deters casual abuse; it is not a user credential. */
export function requireMobileApiKey(request: Request): void {
  const provided = request.headers.get("x-api-key") ?? "";
  if (!provided || !safeEqual(provided, env().MOBILE_API_KEY)) {
    throw new UnauthorizedError("Missing or invalid API key.");
  }
}

/** Dashboard REST endpoints use the Auth.js session cookie and role permissions. */
export async function requireApiUser(permission?: Permission) {
  if (permission) return requirePermission(permission);
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
