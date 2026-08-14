"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getActiveImpersonation, setImpersonationCookie, clearImpersonationCookie } from "@/lib/auth/impersonation";

export type ActionResult = { error: string } | { success: true };

export async function startImpersonation(workspaceId: string, reason?: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return { error: "المولدة غير موجودة." };

  const existing = await getActiveImpersonation(admin.id);
  if (existing) {
    await db.adminImpersonation.update({ where: { id: existing.id }, data: { endedAt: new Date() } });
  }

  const record = await db.adminImpersonation.create({
    data: { adminUserId: admin.id, workspaceId, reason },
  });

  await db.auditLog.create({
    data: {
      workspaceId,
      actorUserId: admin.id,
      action: "admin.impersonation_start",
      entity: "Workspace",
      entityId: workspaceId,
    },
  });

  await setImpersonationCookie(record.id);
  redirect("/dashboard");
}

export async function endImpersonation(): Promise<void> {
  const admin = await requirePlatformAdmin();
  const existing = await getActiveImpersonation(admin.id);

  if (existing) {
    await db.adminImpersonation.update({ where: { id: existing.id }, data: { endedAt: new Date() } });
    await db.auditLog.create({
      data: {
        workspaceId: existing.workspaceId,
        actorUserId: admin.id,
        action: "admin.impersonation_end",
        entity: "Workspace",
        entityId: existing.workspaceId,
      },
    });
  }

  await clearImpersonationCookie();
  redirect("/admin/workspaces");
}
