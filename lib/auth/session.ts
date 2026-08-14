import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { getActiveImpersonation } from "@/lib/auth/impersonation";
import type { MemberRole } from "@prisma/client";

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
        impersonating: true,
      };
    }
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/onboarding");
  if (membership.workspace.status !== "ACTIVE") redirect("/suspended");
  return { user, membership, workspace: membership.workspace, role: membership.role as MemberRole, impersonating: false };
}

export async function requirePlatformAdmin() {
  const user = await requireAuthUser();
  const admin = await db.platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) redirect("/dashboard");
  return user;
}
