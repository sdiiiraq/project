import "server-only";
import { Prisma, type PrismaClient, type SubscriptionTier } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyWorkspace } from "@/lib/domain/notifications";

type Tx = Prisma.TransactionClient | PrismaClient;

/** يُرمى عندما يشير معرّف سجل إلى مولدة أخرى — لا يجب أن يحدث عبر الواجهة إطلاقًا. */
export class CrossTenantAccessError extends Error {
  constructor(entity: string) {
    super(`${entity} غير موجود.`);
    this.name = "CrossTenantAccessError";
  }
}

/**
 * تأكيد أن المشترك يعود فعلًا لهذه المولدة.
 *
 * دوال هذه الطبقة تستقبل workspaceId أصلًا لكنها كانت تستخدمه للسجل فقط، وتعتمد على
 * أن المُستدعي تحقق من الملكية. المُستدعون الحاليون يتحققون فعلًا، لكن الاعتماد على ذلك
 * يعني أن أي مسار جديد ينسى الفحص يفتح كتابة عابرة للمستأجرين. الفحص هنا يجعل الطبقة
 * آمنة بذاتها (defense in depth) بتكلفة استعلام واحد مفهرس.
 */
async function assertCustomerInWorkspace(tx: Tx, customerId: string, workspaceId: string): Promise<void> {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, workspaceId },
    select: { id: true },
  });
  if (!customer) throw new CrossTenantAccessError("المشترك");
}

export function monthRange(year: number, month: number) {
  // month: 1-12. نستخدم UTC لتفادي انزياح التاريخ حسب منطقة الخادم.
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

/**
 * حجز رقم المشترك التالي بشكل ذرّي.
 *
 * كان: COUNT(*) + 1 — قراءة ثم كتابة، أي أن موظفَين يضيفان مشتركًا في نفس اللحظة
 * يحصلان على نفس الرقم ويفشل أحدهما بـ P2002.
 * صار: UPDATE ... SET seq = seq + 1 RETURNING — القراءة والزيادة عملية واحدة على مستوى
 * PostgreSQL، والصف مقفول للمدة الأدنى الممكنة. لا يمكن لطلبين الحصول على نفس الرقم.
 */
export async function nextSubscriberNumber(tx: Tx, workspaceId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ subscriberSequence: number }[]>`
    UPDATE workspaces
    SET "subscriberSequence" = "subscriberSequence" + 1
    WHERE id = ${workspaceId}::uuid
    RETURNING "subscriberSequence";
  `;

  const next = rows[0]?.subscriberSequence;
  if (next === undefined) throw new Error("المولدة غير موجودة.");

  return String(next).padStart(4, "0");
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
  // الرقم يُحجز خارج المعاملة الرئيسية عمدًا: UPDATE واحد قصير يُحرِّر قفل صف المولدة فورًا
  // بدل حجزه طوال المعاملة (ست عمليات متتالية). لولا ذلك لتسلسلت كل الإضافات المتزامنة لنفس
  // المولدة خلف بعضها وتجاوزت مهلة المعاملة تحت الحمل.
  // المقابل: إذا فشلت المعاملة بعد الحجز يبقى فراغ في الترقيم — مقبول، والأهم ألا يتكرر رقم.
  const subscriberNumber = await nextSubscriberNumber(db, params.workspaceId);

  return db.$transaction(async (tx) => {
    const plan = await resolveAmperePlanByAmperes(tx, params.workspaceId, params.amperes, params.tier);

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

    // فاتورة الشهر الأول تكون بكامل قيمة الاشتراك (أمبيرات × سعر) دائمًا، بلا أي تناسب مع أيام
    // الشهر المتبقية — المبلغ المطلوب من المشترك يطابق سعر اشتراكه دائمًا.
    const invoice = await tx.invoice.create({
      data: {
        workspaceId: params.workspaceId,
        customerId: customer.id,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
        amount: plan.monthlyPrice,
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
    await assertCustomerInWorkspace(tx, params.customerId, params.workspaceId);

    const plan = await resolveAmperePlanByAmperes(tx, params.workspaceId, params.amperes, params.tier);

    const subscription = await tx.customerSubscription.findFirstOrThrow({
      where: { customerId: params.customerId, status: "ACTIVE", customer: { workspaceId: params.workspaceId } },
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

// حجم الدفعة الواحدة: عدد الاشتراكات التي تُقرأ وتُدرَج فواتيرها في جولة واحدة.
// يبقي استهلاك الذاكرة ثابتًا مهما بلغ عدد مشتركي الـ workspace.
const INVOICE_BATCH_SIZE = 500;

// Idempotent: لن يُنشئ فاتورة مكررة لنفس المشترك ونفس فترة الفوترة بفضل Unique Constraint في قاعدة البيانات.
// التنفيذ يقرأ الاشتراكات على دفعات بـ cursor pagination ويُدرج الفواتير بـ createMany —
// لا يُحمّل كل اشتراكات الـ workspace في الذاكرة، ولا يُنفّذ INSERT منفصلًا لكل مشترك.
export async function generateMonthlyInvoices(workspaceId: string, year: number, month: number) {
  const { periodStart, periodEnd } = monthRange(year, month);

  let created = 0;
  let total = 0;
  let cursor: string | undefined;

  for (;;) {
    const subscriptions = await db.customerSubscription.findMany({
      where: { status: "ACTIVE", customer: { workspaceId, deletedAt: null } },
      select: { id: true, customerId: true, price: true },
      orderBy: { id: "asc" },
      take: INVOICE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (subscriptions.length === 0) break;

    total += subscriptions.length;
    cursor = subscriptions[subscriptions.length - 1]!.id;

    // مشترك واحد قد يملك أكثر من اشتراك نشط، والقيد الفريد يسمح بفاتورة واحدة له لكل فترة —
    // نُزيل التكرار داخل الدفعة قبل الإدراج حتى لا يعتمد الناتج على ترتيب حلّ التعارض في قاعدة البيانات.
    const seenCustomers = new Set<string>();
    const rows: Prisma.InvoiceCreateManyInput[] = [];
    for (const subscription of subscriptions) {
      if (seenCustomers.has(subscription.customerId)) continue;
      seenCustomers.add(subscription.customerId);
      rows.push({
        workspaceId,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
        amount: subscription.price,
        status: "UNPAID",
      });
    }

    if (rows.length > 0) {
      // skipDuplicates يترجم إلى ON CONFLICT DO NOTHING — إعادة تشغيل الدورة لا تُنتج فواتير مكررة.
      const result = await db.invoice.createMany({ data: rows, skipDuplicates: true });
      created += result.count;
    }

    if (subscriptions.length < INVOICE_BATCH_SIZE) break;
  }

  return { created, skipped: total - created, total };
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
    await assertCustomerInWorkspace(tx, params.customerId, params.workspaceId);

    await tx.$queryRaw`SELECT id FROM invoices WHERE "customerId" = ${params.customerId}::uuid AND "workspaceId" = ${params.workspaceId}::uuid AND status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE') FOR UPDATE`;

    let remaining = params.amount;
    const openInvoices = await tx.invoice.findMany({
      where: {
        customerId: params.customerId,
        workspaceId: params.workspaceId,
        status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] },
      },
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
      where: { customerId: params.customerId, workspaceId: params.workspaceId, status: { not: "PAID" } },
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
