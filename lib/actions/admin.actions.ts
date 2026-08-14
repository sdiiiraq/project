"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import {
  changeWorkspaceStatusSchema,
  changeWorkspacePlanSchema,
  extendTrialSchema,
  addBillingCreditSchema,
  setFeatureOverrideSchema,
  upsertPlanSchema,
} from "@/lib/validation/admin";

export type ActionResult = { error: string } | { success: true };

async function logAdminAction(adminUserId: string, workspaceId: string, action: string, after?: unknown) {
  await db.auditLog.create({
    data: { workspaceId, actorUserId: adminUserId, action, entity: "Workspace", entityId: workspaceId, after: after as never },
  });
}

export async function changeWorkspaceStatus(input: unknown): Promise<ActionResult> {
  const parsed = changeWorkspaceStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  await db.workspace.update({ where: { id: parsed.data.workspaceId }, data: { status: parsed.data.status } });
  await logAdminAction(admin.id, parsed.data.workspaceId, "admin.workspace_status_change", { status: parsed.data.status });

  revalidatePath(`/admin/workspaces/${parsed.data.workspaceId}`);
  revalidatePath("/admin/workspaces");
  return { success: true };
}

export async function changeWorkspacePlan(input: unknown): Promise<ActionResult> {
  const parsed = changeWorkspacePlanSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  const plan = await db.platformPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) return { error: "الباقة غير موجودة." };

  await db.platformSubscription.upsert({
    where: { workspaceId: parsed.data.workspaceId },
    update: { planId: plan.id, price: plan.price, status: "ACTIVE" },
    create: {
      workspaceId: parsed.data.workspaceId,
      planId: plan.id,
      price: plan.price,
      status: "ACTIVE",
      startDate: new Date(),
    },
  });

  await logAdminAction(admin.id, parsed.data.workspaceId, "admin.plan_change", { planId: plan.id, planName: plan.name });

  revalidatePath(`/admin/workspaces/${parsed.data.workspaceId}`);
  return { success: true };
}

export async function extendTrial(input: unknown): Promise<ActionResult> {
  const parsed = extendTrialSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  const subscription = await db.platformSubscription.findUnique({ where: { workspaceId: parsed.data.workspaceId } });
  if (!subscription) return { error: "لا يوجد اشتراك منصّة لهذا Workspace." };

  const base = subscription.trialEnd && subscription.trialEnd > new Date() ? subscription.trialEnd : new Date();
  const newTrialEnd = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

  await db.platformSubscription.update({
    where: { workspaceId: parsed.data.workspaceId },
    data: { trialEnd: newTrialEnd, status: "TRIAL" },
  });

  await logAdminAction(admin.id, parsed.data.workspaceId, "admin.trial_extend", { days: parsed.data.days, newTrialEnd });

  revalidatePath(`/admin/workspaces/${parsed.data.workspaceId}`);
  return { success: true };
}

export async function addBillingCredit(input: unknown): Promise<ActionResult> {
  const parsed = addBillingCreditSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  const subscription = await db.platformSubscription.findUnique({ where: { workspaceId: parsed.data.workspaceId } });
  if (!subscription) return { error: "لا يوجد اشتراك منصّة لهذا Workspace." };

  await db.billingTransaction.create({
    data: {
      platformSubscriptionId: subscription.id,
      amount: parsed.data.amount,
      type: "CREDIT",
      provider: "MANUAL",
      note: parsed.data.note ?? `رصيد يدوي من ${admin.email ?? "الإدارة"}`,
    },
  });

  await logAdminAction(admin.id, parsed.data.workspaceId, "admin.billing_credit", { amount: parsed.data.amount });

  revalidatePath(`/admin/workspaces/${parsed.data.workspaceId}`);
  return { success: true };
}

export async function setFeatureOverride(input: unknown): Promise<ActionResult> {
  const parsed = setFeatureOverrideSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  await db.workspaceFeatureOverride.upsert({
    where: { workspaceId_featureKey: { workspaceId: parsed.data.workspaceId, featureKey: parsed.data.featureKey } },
    update: { enabled: parsed.data.enabled, reason: parsed.data.reason },
    create: {
      workspaceId: parsed.data.workspaceId,
      featureKey: parsed.data.featureKey,
      enabled: parsed.data.enabled,
      reason: parsed.data.reason,
    },
  });

  await logAdminAction(admin.id, parsed.data.workspaceId, "admin.feature_override", parsed.data);

  revalidatePath(`/admin/workspaces/${parsed.data.workspaceId}`);
  return { success: true };
}

export async function upsertPlan(input: unknown): Promise<ActionResult> {
  const parsed = upsertPlanSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  await requirePlatformAdmin();

  const { id, ...data } = parsed.data;

  if (id) {
    await db.platformPlan.update({ where: { id }, data });
  } else {
    await db.platformPlan.create({ data });
  }

  revalidatePath("/admin/plans");
  return { success: true };
}
