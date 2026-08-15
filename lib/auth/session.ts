import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { getActiveImpersonation } from "@/lib/auth/impersonation";
import { PERMISSIONS, type PermissionKey } from "@/lib/rbac/permissions";
import type { MemberRole } from "@prisma/client";

const ALL_PERMISSIONS = new Set(Object.keys(PERMISSIONS) as PermissionKey[]);

export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

// أول Workspace ينتمي إليه المستخدم — الإصدار الحالي يدعم Workspace واحد لكل مستخدم.
export async function getCurrentMembership(userId: string) {
  return db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
}

// المالك يملك كل الصلاحيات دائمًا. الموظف صلاحياته محصورة بما مُنح له فعليًا (WorkspaceMemberPermission)
// — لا افتراضات، ولا يمكن لموظف تصعيد صلاحياته بنفسه لأن هذه المجموعة تُحسب من قاعدة البيانات فقط.
async function computePermissions(role: MemberRole, memberId: string | null): Promise<Set<PermissionKey>> {
  if (role === "OWNER") return ALL_PERMISSIONS;
  if (!memberId) return new Set();
  const grants = await db.workspaceMemberPermission.findMany({ where: { memberId }, select: { permissionKey: true } });
  return new Set(grants.map((g) => g.permissionKey as PermissionKey));
}

export async function requireWorkspace() {
  const user = await requireAuthUser();

  // Admin Impersonation Context: مشرف المنصة يعرض بيانات مولدة أخرى دون تسجيل دخول حقيقي كصاحبها.
  const admin = await db.platformAdmin.findUnique({ where: { userId: user.id } });
  if (admin) {
    const impersonation = await getActiveImpersonation(user.id);
    if (impersonation) {
      return {
        user,
        membership: null,
        workspace: impersonation.workspace,
        role: "OWNER" as MemberRole,
        permissions: ALL_PERMISSIONS,
        impersonating: true,
      };
    }
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/onboarding");
  if (membership.workspace.status !== "ACTIVE") redirect("/suspended");
  const role = membership.role as MemberRole;
  const permissions = await computePermissions(role, membership.id);
  return { user, membership, workspace: membership.workspace, role, permissions, impersonating: false };
}

export async function requirePlatformAdmin() {
  const user = await requireAuthUser();
  const admin = await db.platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) redirect("/dashboard");
  return user;
}
