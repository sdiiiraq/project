"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { applyPayment } from "@/lib/domain/billing";
import { recordPaymentSchema, adjustPaymentSchema } from "@/lib/validation/payment";

export type ActionResult = { error: string } | { success: true };

export async function recordPayment(input: unknown): Promise<ActionResult> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "payments.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, workspaceId: workspace.id } });
  if (!customer) return { error: "المشترك غير موجود." };

  await applyPayment({
    workspaceId: workspace.id,
    customerId: parsed.data.customerId,
    actorUserId: user.id,
    amount: parsed.data.amount,
    date: parsed.data.date,
    method: parsed.data.method,
    note: parsed.data.note,
  });

  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

// لا يُحذف Payment مطلقًا — أي تصحيح لدفعة سابقة يتم عبر PaymentAdjustment مع سبب موثّق.
export async function adjustPayment(input: unknown): Promise<ActionResult> {
  const parsed = adjustPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "payments.adjust");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const payment = await db.payment.findFirst({ where: { id: parsed.data.paymentId, workspaceId: workspace.id } });
  if (!payment) return { error: "الدفعة غير موجودة." };

  await db.$transaction([
    db.paymentAdjustment.create({
      data: {
        paymentId: payment.id,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        actorUserId: user.id,
      },
    }),
    db.ledgerEntry.create({
      data: {
        workspaceId: workspace.id,
        type: "ADJUSTMENT",
        direction: parsed.data.amount > 0 ? "CREDIT" : "DEBIT",
        referenceId: payment.id,
        amount: Math.abs(parsed.data.amount),
        description: parsed.data.reason,
      },
    }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "payment.adjust",
        entity: "Payment",
        entityId: payment.id,
        after: { amount: parsed.data.amount, reason: parsed.data.reason },
      },
    }),
  ]);

  revalidatePath(`/customers/${payment.customerId}`);
  return { success: true };
}
