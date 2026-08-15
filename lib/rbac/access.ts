import "server-only";
import type { PermissionKey } from "./permissions";

// permissions هي المجموعة الفعلية المحسوبة للعضو الحالي (requireWorkspace) — كاملة دائمًا للمالك،
// ومبنية من WorkspaceMemberPermission للموظف. لا يوجد أي فحص يعتمد على "الدور" وحده بعد الآن.
export function roleHasPermission(permissions: ReadonlySet<PermissionKey>, permission: PermissionKey): boolean {
  return permissions.has(permission);
}

export class ForbiddenError extends Error {
  constructor(message = "لا تملك صلاحية تنفيذ هذا الإجراء.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requirePermission(permissions: ReadonlySet<PermissionKey>, permission: PermissionKey): void {
  if (!roleHasPermission(permissions, permission)) {
    throw new ForbiddenError();
  }
}
