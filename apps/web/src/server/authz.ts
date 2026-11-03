import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { can, type Permission } from "@/lib/permissions";
import { userRepository } from "@/server/repositories/user-repository";

export interface CurrentUser {
  id: number;
  uuid: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Loads the signed-in user from the database on every request so that role changes and
 * deactivation take effect immediately, not only when the session token expires.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const uuid = session?.user?.id;
  if (!uuid) return null;
  const user = await userRepository.findActiveByUuid(uuid);
  if (!user) return null;
  return { id: user.id, uuid: user.uuid, name: user.name, email: user.email, role: user.role };
});

/** For pages: redirects to the login page when not signed in. */
export async function requirePageUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

/** For server actions and API routes: throws instead of redirecting. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}
