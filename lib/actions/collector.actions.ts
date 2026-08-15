"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { assignCollectorSchema, settleCollectorSchema } from "@/lib/validation/operations";
import { notifyWorkspace } from "@/lib/domain/notifications";

export type ActionResult = { error: string } | { success: true };

export async function assignCollector(input: unknown): Promise<ActionResult> {
  const parsed = assignCollectorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "collectors.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const [collector, customer] = await Promise.all([
    db.workspaceMember.findFirst({ where: { workspaceId: workspace.id, userId: parsed.data.collectorUserId } }),
    db.customer.findFirst({ where: { id: parsed.data.customerId, workspaceId: workspace.id } }),
  ]);
  if (!collector) return { error: "الجابي غير موجود في هذا الفريق." };
  if (!customer) return { error: "المشترك غير موجود." };

  await db.collectorAssignment.create({
    data: { workspaceId: workspace.id, collectorUserId: parsed.data.collectorUserId, customerId: parsed.data.customerId },
  });

  revalidatePath("/collectors");
  return { success: true };
}

export async function unassignCollector(assignmentId: string): Promise<ActionResult> {
  const { workspace, role, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "collectors.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const assignment = await db.collectorAssignment.findFirst({ where: { id: assignmentId, workspaceId: workspace.id } });
  if (!assignment) return { error: "التعيين غير موجود." };

  await db.collectorAssignment.update({ where: { id: assignmentId }, data: { unassignedAt: new Date() } });

  revalidatePath("/collectors");
  return { success: true };
}

export async function settleCollector(input: unknown): Promise<ActionResult> {
  const parsed = settleCollectorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "collectors.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const { collectorUserId, periodStart, periodEnd, expectedAmount, actualAmount, notes } = parsed.data;

  const collectorMember = await db.workspaceMember.findFirst({ where: { workspaceId: workspace.id, userId: collectorUserId } });
  if (!collectorMember) return { error: "الجابي غير موجود في هذا الفريق." };

  const difference = actualAmount - expectedAmount;

  const status = difference === 0 ? "COMPLETED" : "DISPUTED";

  await db.collectorSettlement.create({
    data: {
      workspaceId: workspace.id,
      collectorUserId,
      periodStart,
      periodEnd,
      expectedAmount,
      actualAmount,
      difference,
      status,
      settledByUserId: user.id,
      settledAt: new Date(),
      notes,
    },
  });

  if (status === "DISPUTED") {
    const collector = await db.user.findUnique({ where: { id: collectorUserId } });
    await notifyWorkspace({
      workspaceId: workspace.id,
      type: "COLLECTOR_SETTLEMENT",
      title: "تسوية جابي بها فرق",
      body: `تسوية ${collector?.fullName ?? "جابي"} بها فرق ${difference.toLocaleString("ar-IQ")} د.ع ويحتاج مراجعة.`,
    });
  }

  revalidatePath("/collectors");
  return { success: true };
}
