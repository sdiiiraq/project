"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { canUseLimit } from "@/lib/rbac/features";
import { createCustomerWithSubscription, changeCustomerAmpere } from "@/lib/domain/billing";
import {
  createCustomerSchema,
  updateCustomerSchema,
  changeCustomerStatusSchema,
  changeAmpereSchema,
} from "@/lib/validation/customer";

export type ActionResult = { error: string } | { success: true; customerId?: string };

export async function createCustomer(input: unknown): Promise<ActionResult> {
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, user, role, permissions } = await requireWorkspace();

  try {
    requirePermission(permissions, "customers.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const currentCount = await db.customer.count({ where: { workspaceId: workspace.id, deletedAt: null } });
  const { allowed, limit } = await canUseLimit(workspace.id, "customers", currentCount);
  if (!allowed) {
    return { error: `لقد وصلت إلى الحد المسموح في باقتك (${limit} مشترك). قم بترقية الباقة لإضافة المزيد.` };
  }

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });
  if (!generator) return { error: "لم يتم العثور على بيانات المولدة." };

  try {
    const { customer } = await createCustomerWithSubscription({
      workspaceId: workspace.id,
      generatorId: generator.id,
      actorUserId: user.id,
      ...parsed.data,
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { success: true, customerId: customer.id };
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }
}

export async function updateCustomer(input: unknown): Promise<ActionResult> {
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "customers.update");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const { id, ...data } = parsed.data;
  const existing = await db.customer.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) return { error: "المشترك غير موجود." };

  await db.customer.update({ where: { id }, data });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function changeCustomerStatus(input: unknown): Promise<ActionResult> {
  const parsed = changeCustomerStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "customers.update");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.customer.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.id } });
  if (!existing) return { error: "المشترك غير موجود." };

  await db.$transaction([
    db.customer.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "customer.status_change",
        entity: "Customer",
        entityId: parsed.data.id,
        before: { status: existing.status },
        after: { status: parsed.data.status },
      },
    }),
  ]);

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.id}`);
  return { success: true };
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "customers.delete");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.customer.findFirst({ where: { id: customerId, workspaceId: workspace.id } });
  if (!existing) return { error: "المشترك غير موجود." };

  // Soft delete فقط — لا نحذف السجل المالي والتاريخي المرتبط بالمشترك.
  await db.$transaction([
    db.customer.update({ where: { id: customerId }, data: { deletedAt: new Date(), status: "DISCONNECTED" } }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "customer.delete",
        entity: "Customer",
        entityId: customerId,
      },
    }),
  ]);

  revalidatePath("/customers");
  return { success: true };
}

export async function changeAmpere(input: unknown): Promise<ActionResult> {
  const parsed = changeAmpereSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "subscriptions.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, workspaceId: workspace.id } });
  if (!customer) return { error: "المشترك غير موجود." };

  try {
    await changeCustomerAmpere({
      workspaceId: workspace.id,
      actorUserId: user.id,
      customerId: parsed.data.customerId,
      amperes: parsed.data.amperes,
      tier: parsed.data.tier,
      reason: parsed.data.reason,
    });

    revalidatePath(`/customers/${parsed.data.customerId}`);
    return { success: true };
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }
}
