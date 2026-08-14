import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyWorkspace } from "@/lib/domain/notifications";

type Tx = Prisma.TransactionClient | PrismaClient;

export function monthRange(year: number, month: number) {
  // month: 1-12. نستخدم UTC لتفادي انزياح التاريخ حسب منطقة الخادم.
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

// المشترك الجديد أو تغيير الأمبير منتصف الشهر: يُحتسب المبلغ بالتناسب مع الأيام المتبقية من الشهر
// (شامل يوم البدء نفسه) داخل نفس الشهر التقويمي لـ fromDate.
export function prorateAmount(monthlyPrice: number, fromDate: Date): number {
  const totalDays = daysInMonth(fromDate);
  const remainingDays = Math.max(1, totalDays - fromDate.getUTCDate() + 1);
  const dailyRate = monthlyPrice / totalDays;
  return Math.round(dailyRate * remainingDays);
}

export async function nextSubscriberNumber(tx: Tx, workspaceId: string): Promise<string> {
  const count = await tx.customer.count({ where: { workspaceId } });
  return String(count + 1).padStart(4, "0");
}

export async function createCustomerWithSubscription(params: {
  workspaceId: string;
  generatorId: string;
  actorUserId: string;
  name: string;
  phone?: string;
  region?: string;
  neighborhood?: string;
  alley?: string;
  houseNumber?: string;
  notes?: string;
  amperePlanId: string;
}) {
  return db.$transaction(async (tx) => {
    const plan = await tx.amperePlan.findFirstOrThrow({
      where: { id: params.amperePlanId, workspaceId: params.workspaceId },
    });

    const subscriberNumber = await nextSubscriberNumber(tx, params.workspaceId);
    const now = new Date();

    const customer = await tx.customer.create({
      data: {
        workspaceId: params.workspaceId,
        generatorId: params.generatorId,
        subscriberNumber,
        name: params.name,
        phone: params.phone,
        region: params.region,
        neighborhood: params.neighborhood,
        alley: params.alley,
        houseNumber: params.houseNumber,
        notes: params.notes,
        status: "ACTIVE",
      },
    });

    const subscription = await tx.customerSubscription.create({
      data: {
        customerId: customer.id,
        amperePlanId: plan.id,
        amperes: plan.amperes,
        price: plan.monthlyPrice,
        startDate: now,
        status: "ACTIVE",
      },
    });

    const { periodStart, periodEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const amount = prorateAmount(Number(plan.monthlyPrice), now);

    const invoice = await tx.invoice.create({
      data: {
        workspaceId: params.workspaceId,
        customerId: customer.id,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
        amount,
        status: "UNPAID",
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        action: "customer.create",
        entity: "Customer",
        entityId: customer.id,
        after: { name: customer.name, subscriberNumber, amperes: plan.amperes },
      },
    });

    return { customer, subscription, invoice };
  });
}

export async function changeCustomerAmpere(params: {
  workspaceId: string;
  actorUserId: string;
  customerId: string;
  amperePlanId: string;
  reason?: string;
}) {
  return db.$transaction(async (tx) => {
    const plan = await tx.amperePlan.findFirstOrThrow({
      where: { id: params.amperePlanId, workspaceId: params.workspaceId },
    });

    const subscription = await tx.customerSubscription.findFirstOrThrow({
      where: { customerId: params.customerId, status: "ACTIVE" },
    });

    const now = new Date();

    await tx.customerAmpereHistory.create({
      data: {
        customerId: params.customerId,
        oldAmperes: subscription.amperes,
        newAmperes: plan.amperes,
        effectiveDate: now,
        oldPrice: subscription.price,
        newPrice: plan.monthlyPrice,
        reason: params.reason,
        changedByUserId: params.actorUserId,
      },
    });

    const updated = await tx.customerSubscription.update({
      where: { id: subscription.id },
      data: { amperePlanId: plan.id, amperes: plan.amperes, price: plan.monthlyPrice },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        action: "customer.ampere_change",
        entity: "Customer",
        entityId: params.customerId,
        before: { amperes: subscription.amperes, price: Number(subscription.price) },
        after: { amperes: plan.amperes, price: Number(plan.monthlyPrice) },
      },
    });

    return updated;
  });
}

// Idempotent: لن يُنشئ فاتورة مكررة لنفس المشترك ونفس فترة الفوترة بفضل Unique Constraint في قاعدة البيانات.
export async function generateMonthlyInvoices(workspaceId: string, year: number, month: number) {
  const { periodStart, periodEnd } = monthRange(year, month);

  const subscriptions = await db.customerSubscription.findMany({
    where: { status: "ACTIVE", customer: { workspaceId, deletedAt: null } },
    include: { customer: true },
  });

  let created = 0;
  let skipped = 0;

  for (const subscription of subscriptions) {
    try {
      await db.invoice.create({
        data: {
          workspaceId,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          periodStart,
          periodEnd,
          amount: subscription.price,
          status: "UNPAID",
        },
      });
      created += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, skipped, total: subscriptions.length };
}

function invoiceStatusFor(amount: number, paidAmount: number): "PAID" | "PARTIALLY_PAID" | "UNPAID" {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= amount) return "PAID";
  return "PARTIALLY_PAID";
}

// تسجيل دفعة: Payment + تحديث الفاتورة + قيد في السجل المالي — كلها داخل معاملة واحدة ذرية.
export async function applyPayment(params: {
  workspaceId: string;
  customerId: string;
  actorUserId: string;
  amount: number;
  date?: Date;
  method?: string;
  note?: string;
}) {
  return db.$transaction(async (tx) => {
    let remaining = params.amount;
    const openInvoices = await tx.invoice.findMany({
      where: { customerId: params.customerId, status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] } },
      orderBy: { periodStart: "asc" },
    });

    const payment = await tx.payment.create({
      data: {
        workspaceId: params.workspaceId,
        customerId: params.customerId,
        amount: params.amount,
        date: params.date ?? new Date(),
        method: params.method ?? "CASH",
        note: params.note,
        createdByUserId: params.actorUserId,
        invoiceId: openInvoices[0]?.id,
      },
    });

    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      const due = Number(invoice.amount) - Number(invoice.paidAmount);
      const applied = Math.min(due, remaining);
      remaining -= applied;

      const newPaidAmount = Number(invoice.paidAmount) + applied;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          status: invoiceStatusFor(Number(invoice.amount), newPaidAmount),
        },
      });
    }

    await tx.ledgerEntry.create({
      data: {
        workspaceId: params.workspaceId,
        type: "PAYMENT",
        direction: "CREDIT",
        referenceId: payment.id,
        paymentId: payment.id,
        amount: params.amount,
        description: `دفعة من المشترك`,
      },
    });

    const outstanding = await tx.invoice.aggregate({
      where: { customerId: params.customerId, status: { not: "PAID" } },
      _sum: { amount: true, paidAmount: true },
    });
    const stillOwes = Number(outstanding._sum.amount ?? 0) - Number(outstanding._sum.paidAmount ?? 0);

    await tx.customer.update({
      where: { id: params.customerId },
      data: { status: stillOwes > 0 ? "OVERDUE" : "ACTIVE" },
    });

    return { payment, stillOwes };
  }).then(async ({ payment, stillOwes }) => {
    if (stillOwes <= 0) {
      const customer = await db.customer.findUnique({ where: { id: params.customerId } });
      await notifyWorkspace({
        workspaceId: params.workspaceId,
        type: "PAYMENT",
        title: "تحصيل دفعة",
        body: `تم تحصيل ${params.amount.toLocaleString("ar-IQ")} د.ع من ${customer?.name ?? "مشترك"} وتصفية المستحقات بالكامل.`,
      });
    }
    return payment;
  });
}
