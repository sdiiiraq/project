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
// الصلاحيات تُجلب ضمن نفس الاستعلام بدل استعلام ثانٍ تابع له.
export async function getCurrentMembership(userId: string) {
  return db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true, permissions: { select: { permissionKey: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// المالك يملك كل الصلاحيات دائمًا. الموظف صلاحياته محصورة بما مُنح له فعليًا (WorkspaceMemberPermission)
// — لا افتراضات، ولا يمكن لموظف تصعيد صلاحياته بنفسه لأن هذه المجموعة تُحسب من قاعدة البيانات فقط.
// الدالة صارت متزامنة: المصدر لم يتغيّر (نفس صفوف قاعدة البيانات)، تغيّر توقيت جلبه فقط.
function computePermissions(role: MemberRole, grants: { permissionKey: string }[]): Set<PermissionKey> {
  if (role === "OWNER") return ALL_PERMISSIONS;
  return new Set(grants.map((g) => g.permissionKey as PermissionKey));
}

export async function requireWorkspace() {
  const user = await requireAuthUser();

  // الاستعلامات الثلاثة مستقلة عن بعضها، فتُنفَّذ معًا بدل التتابع.
  // ملاحظة: الفائدة الفعلية مرهونة برفع connection_limit — عند القيمة 1 تتناوب
  // هذه الاستعلامات على اتصال واحد ولا يتحقق أي توازٍ حقيقي.
  //
  // getActiveImpersonation آمنة للاستدعاء لأي مستخدم: استعلامها مُقيَّد بـ adminUserId،
  // فكوكي مزوَّر من غير مشرف لا يطابق أي سجل. ومع ذلك لا تُستخدَم نتيجتها إطلاقًا
  // إلا بعد التأكد من صفة المشرف أدناه — التحقق من الصلاحية لم يضعف.
  const [admin, impersonation, membership] = await Promise.all([
    db.platformAdmin.findUnique({ where: { userId: user.id } }),
    getActiveImpersonation(user.id),
    getCurrentMembership(user.id),
  ]);

  // Admin Impersonation Context: مشرف المنصة يعرض بيانات مولدة أخرى دون تسجيل دخول حقيقي كصاحبها.
  if (admin && impersonation) {
    return {
      user,
      membership: null,
      workspace: impersonation.workspace,
      role: "OWNER" as MemberRole,
      permissions: ALL_PERMISSIONS,
      impersonating: true,
    };
  }

  if (!membership) redirect("/onboarding");
  if (membership.workspace.status !== "ACTIVE") redirect("/suspended");
  const role = membership.role as MemberRole;
  const permissions = computePermissions(role, membership.permissions);
  return { user, membership, workspace: membership.workspace, role, permissions, impersonating: false };
}

export async function requirePlatformAdmin() {
  const user = await requireAuthUser();
  const admin = await db.platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) redirect("/dashboard");
  return user;
}
