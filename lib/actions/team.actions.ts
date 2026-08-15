"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { canUseLimit } from "@/lib/rbac/features";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeIraqiPhone, isEmail } from "@/lib/utils/phone";
import { addEmployeeSchema, updateEmployeePermissionsSchema, removeEmployeeSchema } from "@/lib/validation/team";
import type { PermissionKey } from "@/lib/rbac/permissions";

export type ActionResult = { error: string } | { success: true };

// موظف لا يملك دور OWNER لا يقدر يمنح صلاحية لا يملكها هو نفسه — يمنع تصعيد الصلاحيات.
function assertNoPrivilegeEscalation(actorRole: string, actorPermissions: ReadonlySet<PermissionKey>, requested: string[]) {
  if (actorRole === "OWNER") return;
  const notOwned = requested.filter((p) => !actorPermissions.has(p as PermissionKey));
  if (notOwned.length > 0) {
    throw new ForbiddenError("لا يمكنك منح صلاحيات لا تملكها أنت نفسك.");
  }
}

export async function addEmployee(input: unknown): Promise<ActionResult> {
  const parsed = addEmployeeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "team.manage");
    assertNoPrivilegeEscalation(role, permissions, parsed.data.permissions);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const currentUserCount = await db.workspaceMember.count({ where: { workspaceId: workspace.id } });
  const { allowed, limit } = await canUseLimit(workspace.id, "users", currentUserCount);
  if (!allowed) {
    return { error: `لقد وصلت إلى الحد المسموح في باقتك (${limit} مستخدم). قم بترقية الباقة لإضافة المزيد.` };
  }

  const email = parsed.data.email && isEmail(parsed.data.email) ? parsed.data.email : undefined;
  const phone = parsed.data.phone ? normalizeIraqiPhone(parsed.data.phone) : undefined;
  if (!email && !phone) return { error: "أدخل بريدًا إلكترونيًا أو رقم هاتف صحيح." };

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    phone,
    password: parsed.data.password,
    email_confirm: !!email,
    phone_confirm: !!phone,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "";
    if (message.includes("already been registered") || message.includes("already exists")) {
      return { error: "هذا البريد الإلكتروني أو الرقم مستخدم بالفعل." };
    }
    return { error: "تعذّر إنشاء حساب الموظف. حاول مرة أخرى." };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: created.user.id, fullName: parsed.data.fullName, email: email ?? null, phone: phone ?? null },
      });

      const member = await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: created.user.id, role: "EMPLOYEE" },
      });

      if (parsed.data.permissions.length > 0) {
        await tx.workspaceMemberPermission.createMany({
          data: parsed.data.permissions.map((permissionKey) => ({ memberId: member.id, permissionKey })),
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: user.id,
          action: "team.employee_add",
          entity: "WorkspaceMember",
          entityId: member.id,
          after: { fullName: parsed.data.fullName, permissions: parsed.data.permissions },
        },
      });
    });
  } catch (e) {
    // فشل إنشاء العضوية بعد إنشاء حساب Supabase بنجاح — نتراجع عن حساب Supabase حتى لا يبقى معلّقًا بلا Workspace.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateEmployeePermissions(input: unknown): Promise<ActionResult> {
  const parsed = updateEmployeePermissionsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "team.manage");
    assertNoPrivilegeEscalation(role, permissions, parsed.data.permissions);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const member = await db.workspaceMember.findFirst({
    where: { id: parsed.data.memberId, workspaceId: workspace.id },
    include: { permissions: true },
  });
  if (!member) return { error: "العضو غير موجود." };
  if (member.role === "OWNER") return { error: "لا يمكن تعديل صلاحيات المالك." };
  if (member.userId === user.id) return { error: "لا يمكنك تعديل صلاحياتك أنت بنفسك." };

  const before = member.permissions.map((p) => p.permissionKey);

  await db.$transaction(async (tx) => {
    await tx.workspaceMemberPermission.deleteMany({ where: { memberId: member.id } });
    if (parsed.data.permissions.length > 0) {
      await tx.workspaceMemberPermission.createMany({
        data: parsed.data.permissions.map((permissionKey) => ({ memberId: member.id, permissionKey })),
      });
    }
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "team.permissions_change",
        entity: "WorkspaceMember",
        entityId: member.id,
        before: { permissions: before },
        after: { permissions: parsed.data.permissions },
      },
    });
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function removeEmployee(input: unknown): Promise<ActionResult> {
  const parsed = removeEmployeeSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "team.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const member = await db.workspaceMember.findFirst({ where: { id: parsed.data.memberId, workspaceId: workspace.id } });
  if (!member) return { error: "العضو غير موجود." };
  if (member.role === "OWNER") return { error: "لا يمكن إزالة المالك." };
  if (member.userId === user.id) return { error: "لا يمكنك إزالة نفسك." };

  await db.$transaction([
    db.workspaceMember.delete({ where: { id: member.id } }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "team.employee_remove",
        entity: "WorkspaceMember",
        entityId: member.id,
      },
    }),
  ]);

  revalidatePath("/settings");
  return { success: true };
}
