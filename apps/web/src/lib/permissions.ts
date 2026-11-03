import type { UserRole } from "@bpa/shared";

const PERMISSIONS = {
  "dashboard:read": ["ADMIN", "MANAGER", "VIEWER"],
  "analytics:read": ["ADMIN", "MANAGER", "VIEWER"],
  "campaigns:write": ["ADMIN", "MANAGER"],
  "advertisements:write": ["ADMIN", "MANAGER"],
  "stations:write": ["ADMIN", "MANAGER"],
  "stations:command": ["ADMIN", "MANAGER"],
  "stations:credentials": ["ADMIN"],
  "settings:write": ["ADMIN"],
  "users:manage": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access, including users, system settings and station credentials.",
  MANAGER: "Manage campaigns, advertisements and stations. Cannot manage users or credentials.",
  VIEWER: "Read-only access to dashboards, campaigns, stations and analytics.",
};
