import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

// بيانات اختبار معزولة: كل استدعاء يُنشئ مستخدمًا وworkspace جديدين تمامًا،
// فلا تتداخل الاختبارات مع بعضها ولا مع بيانات سابقة.

export type TestWorkspace = {
  userId: string;
  workspaceId: string;
  generatorId: string;
  amperePlanId: string;
};

export async function createTestWorkspace(options?: { name?: string }): Promise<TestWorkspace> {
  const userId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  await db.user.create({
    data: { id: userId, fullName: `مستخدم اختبار ${suffix}`, email: `test-${suffix}@example.test` },
  });

  const workspace = await db.workspace.create({
    data: {
      name: options?.name ?? `مولدة اختبار ${suffix}`,
      ownerId: userId,
      status: "ACTIVE",
      normalAmperePriceIQD: 10_000,
      goldAmperePriceIQD: 15_000,
    },
  });

  await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });

  const generator = await db.generator.create({
    data: { workspaceId: workspace.id, name: `مولدة ${suffix}` },
  });

  const amperePlan = await db.amperePlan.create({
    data: { workspaceId: workspace.id, amperes: 5, tier: "NORMAL", monthlyPrice: 50_000, isCustom: true },
  });

  return { userId, workspaceId: workspace.id, generatorId: generator.id, amperePlanId: amperePlan.id };
}

/** يُنشئ مشتركين باشتراكات نشطة — لتغذية اختبارات الفوترة. */
export async function seedCustomers(ws: TestWorkspace, count: number, price = 50_000): Promise<string[]> {
  const customerIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const customer = await db.customer.create({
      data: {
        workspaceId: ws.workspaceId,
        generatorId: ws.generatorId,
        subscriberNumber: String(i + 1).padStart(4, "0"),
        name: `مشترك ${i + 1}`,
        status: "ACTIVE",
      },
    });

    await db.customerSubscription.create({
      data: {
        customerId: customer.id,
        amperePlanId: ws.amperePlanId,
        amperes: 5,
        tier: "NORMAL",
        price,
        startDate: new Date(),
        status: "ACTIVE",
      },
    });

    customerIds.push(customer.id);
  }

  return customerIds;
}

/** يربط الـ workspace بخطة منصّة بحد AI محدد — لاختبار فرض الحصة. */
export async function attachPlan(
  workspaceId: string,
  options: { aiRequestLimit: number | null; customerLimit?: number | null },
): Promise<string> {
  const slug = `test-plan-${randomUUID().slice(0, 8)}`;

  const plan = await db.platformPlan.create({
    data: {
      name: slug,
      slug,
      price: 0,
      aiRequestLimit: options.aiRequestLimit,
      customerLimit: options.customerLimit ?? null,
    },
  });

  await db.platformSubscription.create({
    data: { workspaceId, planId: plan.id, price: 0, status: "ACTIVE" },
  });

  return plan.id;
}

/**
 * حذف كل ما أنشأه الاختبار.
 *
 * الترتيب مقصود: عدة علاقات مالية معرَّفة بـ RESTRICT وليس Cascade (فاتورة ← اشتراك،
 * دفعة ← فاتورة، اشتراك ← باقة أمبير). هذا تصميم صحيح — يمنع ضياع سجل مالي بحذف
 * عرضي — لكنه يعني أن حذف المولدة مباشرةً يفشل ما دامت هذه السجلات قائمة.
 * لا يوجد في التطبيق أي مسار لحذف مولدة، فهذا قيد على الاختبارات فقط.
 */
export async function cleanupWorkspace(ws: TestWorkspace): Promise<void> {
  const workspaceId = ws.workspaceId;

  const subscription = await db.platformSubscription.findUnique({
    where: { workspaceId },
    select: { planId: true },
  });

  // من الأعمق إلى الأعلى في شجرة الاعتماديات.
  await db.ledgerEntry.deleteMany({ where: { workspaceId } });
  await db.paymentAdjustment.deleteMany({ where: { payment: { workspaceId } } });
  await db.payment.deleteMany({ where: { workspaceId } });
  await db.invoice.deleteMany({ where: { workspaceId } });
  await db.customerSubscription.deleteMany({ where: { customer: { workspaceId } } });
  await db.customerAmpereHistory.deleteMany({ where: { customer: { workspaceId } } });
  await db.customer.deleteMany({ where: { workspaceId } });
  await db.amperePlan.deleteMany({ where: { workspaceId } });
  await db.maintenanceRecord.deleteMany({ where: { workspaceId } });
  await db.equipment.deleteMany({ where: { workspaceId } });
  await db.fuelUsage.deleteMany({ where: { workspaceId } });
  await db.operatingSession.deleteMany({ where: { workspaceId } });
  await db.generator.deleteMany({ where: { workspaceId } });

  // الباقي (billingJob، notifications، auditLog، aiRateLimitBucket، usage...) يُحذف
  // بالـ Cascade مع المولدة.
  await db.workspace.delete({ where: { id: workspaceId } });
  await db.user.delete({ where: { id: ws.userId } });
  if (subscription) await db.platformPlan.delete({ where: { id: subscription.planId } });
}
