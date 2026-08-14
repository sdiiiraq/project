import "server-only";
import type { MemberRole } from "@prisma/client";
import { DEFAULT_ROLE_PERMISSIONS } from "./roles";
import type { PermissionKey } from "./permissions";

export function roleHasPermission(role: MemberRole, permission: PermissionKey): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(message = "لا تملك صلاحية تنفيذ هذا الإجراء.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requirePermission(role: MemberRole, permission: PermissionKey): void {
  if (!roleHasPermission(role, permission)) {
    throw new ForbiddenError();
  }
}
