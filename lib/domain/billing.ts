import "server-only";
import { Prisma, type PrismaClient, type SubscriptionTier } from "@prisma/client";
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

// يُنشئ (أو يُحدّث) سجل AmperePlan "ظليّ" مخصص لعدد الأمبيرات المُدخل يدويًا ونوع الاشتراك (عادي/ذهبي)،
// بالسعر المحسوب من سعر الأمبير المطابق في إعدادات الـ Workspace — يحافظ على العلاقة الحالية
// CustomerSubscription -> AmperePlan دون الحاجة لتغيير المخطط الأساسي أو حصر المستخدم بباقات محددة مسبقًا.
async function resolveAmperePlanByAmperes(tx: Tx, workspaceId: string, amperes: number, tier: SubscriptionTier) {
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const price = tier === "GOLD" ? workspace.goldAmperePriceIQD : workspace.normalAmperePriceIQD;
  if (!price || Number(price) <= 0) {
    const label = tier === "GOLD" ? "الذهبي" : "العادي";
    throw new Error(`لم يتم تحديد سعر الأمبير ${label} بعد. اذهب إلى الإعدادات وحدده أولًا.`);
  }
  const monthlyPrice = Math.round(Number(price) * amperes);

  return tx.amperePlan.upsert({
    where: { workspaceId_amperes_isCustom_tier: { workspaceId, amperes, isCustom: true, tier } },
    update: { monthlyPrice, isActive: true },
    create: { workspaceId, amperes, tier, monthlyPrice, isCustom: true },
  });
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
  amperes: number;
  tier: SubscriptionTier;
  customerType: "RESIDENTIAL" | "COMMERCIAL" | "NORMAL";
}) {
  return db.$transaction(async (tx) => {
    const plan = await resolveAmperePlanByAmperes(tx, params.workspaceId, params.amperes, params.tier);

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
        customerType: params.customerType,
        status: "ACTIVE",
      },
    });

    const subscription = await tx.customerSubscription.create({
      data: {
        customerId: customer.id,
        amperePlanId: plan.id,
        amperes: plan.amperes,
        tier: plan.tier,
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
  amperes: number;
  tier: SubscriptionTier;
  reason?: string;
}) {
  return db.$transaction(async (tx) => {
    const plan = await resolveAmperePlanByAmperes(tx, params.workspaceId, params.amperes, params.tier);

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
      data: { amperePlanId: plan.id, amperes: plan.amperes, tier: plan.tier, price: plan.monthlyPrice },
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
    // قفل تشاؤمي (FOR UPDATE) على فواتير المشترك المفتوحة — يمنع Race Condition عند دفعتين متزامنتين
    // لنفس المشترك (Double Click / Retry / طلبين حقيقيين بنفس اللحظة) من تجاوز المبلغ المستحق فعليًا.
    await tx.$queryRaw`SELECT id FROM invoices WHERE "customerId" = ${params.customerId}::uuid AND status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE') FOR UPDATE`;

    let remaining = params.amount;
    const openInvoices = await tx.invoice.findMany({
      where: { customerId: params.customerId, status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] } },
      orderBy: { periodStart: "asc" },
    });

    const outstandingNow = openInvoices.reduce((sum, inv) => sum + (Number(inv.amount) - Number(inv.paidAmount)), 0);
    if (params.amount > outstandingNow) {
      throw new Error(`المبلغ أكبر من المستحق الكلي (${outstandingNow.toLocaleString("ar-IQ")} د.ع). لا يمكن تسجيل دفعة أكبر من المطلوب.`);
    }

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
