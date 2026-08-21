import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  generateMonthlyInvoices,
  monthRange,
  applyPayment,
  changeCustomerAmpere,
  CrossTenantAccessError,
} from "@/lib/domain/billing";
import { cycleKey, enqueueBillingCycle, drainBillingJobs } from "@/lib/domain/billing-jobs";
import { reserveAiRequest } from "@/lib/domain/ai-usage";
import { createTestWorkspace, seedCustomers, attachPlan, cleanupWorkspace, type TestWorkspace } from "./fixtures";

const YEAR = 2032;
const MONTH = 4;
const CYCLE = cycleKey(YEAR, MONTH);

const created: TestWorkspace[] = [];

afterEach(async () => {
  while (created.length > 0) await cleanupWorkspace(created.pop()!);
});

async function makeWorkspace(customers: number) {
  const ws = await createTestWorkspace();
  created.push(ws);
  if (customers > 0) await seedCustomers(ws, customers);
  return ws;
}

describe("اختبار E — عزل المستأجرين تحت وصول متزامن", () => {
  it("فوترة workspace لا تمس بيانات workspace آخر", async () => {
    const [a, b] = await Promise.all([makeWorkspace(6), makeWorkspace(9)]);

    await Promise.all([
      generateMonthlyInvoices(a.workspaceId, YEAR, MONTH),
      generateMonthlyInvoices(b.workspaceId, YEAR, MONTH),
    ]);

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);

    const invoicesA = await db.invoice.findMany({
      where: { workspaceId: a.workspaceId, periodStart, periodEnd },
      select: { workspaceId: true, customerId: true },
    });
    const invoicesB = await db.invoice.findMany({
      where: { workspaceId: b.workspaceId, periodStart, periodEnd },
      select: { workspaceId: true, customerId: true },
    });

    expect(invoicesA).toHaveLength(6);
    expect(invoicesB).toHaveLength(9);

    // لا فاتورة في A تحمل workspaceId الخاص بـ B أو مشتركًا يعود لـ B.
    const customersB = new Set(
      (await db.customer.findMany({ where: { workspaceId: b.workspaceId }, select: { id: true } })).map((c) => c.id),
    );
    expect(invoicesA.every((i) => i.workspaceId === a.workspaceId)).toBe(true);
    expect(invoicesA.some((i) => customersB.has(i.customerId))).toBe(false);
  });

  it("كل فاتورة مرتبطة باشتراك يعود لنفس الـ workspace", async () => {
    const [a, b] = await Promise.all([makeWorkspace(5), makeWorkspace(5)]);

    await enqueueBillingCycle(CYCLE);
    await Promise.all([
      drainBillingJobs({ budgetMs: 30_000, workerId: "iso-1", batchSize: 2 }),
      drainBillingJobs({ budgetMs: 30_000, workerId: "iso-2", batchSize: 2 }),
    ]);

    for (const ws of [a, b]) {
      const invoices = await db.invoice.findMany({
        where: { workspaceId: ws.workspaceId },
        select: { customer: { select: { workspaceId: true } }, subscription: { select: { customer: { select: { workspaceId: true } } } } },
      });

      expect(invoices.length).toBeGreaterThan(0);
      for (const invoice of invoices) {
        expect(invoice.customer.workspaceId).toBe(ws.workspaceId);
        expect(invoice.subscription.customer.workspaceId).toBe(ws.workspaceId);
      }
    }
  });

  it("استهلاك حصة AI في workspace لا يخصم من حصة آخر", async () => {
    const [a, b] = await Promise.all([makeWorkspace(0), makeWorkspace(0)]);
    await attachPlan(a.workspaceId, { aiRequestLimit: 4 });
    await attachPlan(b.workspaceId, { aiRequestLimit: 4 });

    // استنفاد حصة A بالكامل بالتوازي مع طلب واحد على B.
    const [resultsA, resultB] = await Promise.all([
      Promise.all(Array.from({ length: 6 }, () => reserveAiRequest(a.workspaceId))),
      reserveAiRequest(b.workspaceId),
    ]);

    expect(resultsA.filter((r) => r.allowed)).toHaveLength(4);
    expect(resultB.allowed).toBe(true);

    // B ما زالت لديها حصة متبقية رغم استنفاد A.
    const nextB = await reserveAiRequest(b.workspaceId);
    expect(nextB.allowed).toBe(true);
  });

  it("عمل فوترة لـ workspace معطّل لا يُدرَج في الطابور", async () => {
    const active = await makeWorkspace(2);
    const suspended = await makeWorkspace(2);

    await db.workspace.update({ where: { id: suspended.workspaceId }, data: { status: "SUSPENDED" } });

    await enqueueBillingCycle(CYCLE);

    const activeJob = await db.billingJob.findUnique({
      where: { workspaceId_cycle: { workspaceId: active.workspaceId, cycle: CYCLE } },
    });
    const suspendedJob = await db.billingJob.findUnique({
      where: { workspaceId_cycle: { workspaceId: suspended.workspaceId, cycle: CYCLE } },
    });

    expect(activeJob).not.toBeNull();
    expect(suspendedJob).toBeNull();
  });
});

// ============================================================
// محاولات عبور صريحة بين المستأجرين على مستوى طبقة النطاق.
// تمرّر معرّف سجل يعود لمولدة أخرى مع workspaceId الخاص بالمولدة المهاجِمة —
// وهو بالضبط ما سيحدث لو نسي مسار جديد فحص الملكية.
// ============================================================
describe("عبور المستأجرين مرفوض في طبقة النطاق نفسها", () => {
  it("تسجيل دفعة لمشترك يعود لمولدة أخرى يُرفض", async () => {
    const [attacker, victim] = await Promise.all([makeWorkspace(1), makeWorkspace(1)]);

    const victimCustomer = await db.customer.findFirstOrThrow({
      where: { workspaceId: victim.workspaceId },
      select: { id: true },
    });
    await generateMonthlyInvoices(victim.workspaceId, YEAR, MONTH);

    await expect(
      applyPayment({
        workspaceId: attacker.workspaceId, // مولدة المهاجِم
        customerId: victimCustomer.id, // مشترك الضحية
        actorUserId: attacker.userId,
        amount: 1_000,
      }),
    ).rejects.toThrow(CrossTenantAccessError);

    // لا دفعة أُنشئت في أي من المولدتين، ولا تغيّرت فواتير الضحية.
    expect(await db.payment.count({ where: { workspaceId: attacker.workspaceId } })).toBe(0);
    expect(await db.payment.count({ where: { customerId: victimCustomer.id } })).toBe(0);
    const untouched = await db.invoice.findMany({
      where: { customerId: victimCustomer.id },
      select: { paidAmount: true, status: true },
    });
    expect(untouched.every((i) => i.paidAmount === 0 && i.status === "UNPAID")).toBe(true);
  });

  it("تغيير أمبير مشترك يعود لمولدة أخرى يُرفض ولا يترك أثرًا", async () => {
    const [attacker, victim] = await Promise.all([makeWorkspace(1), makeWorkspace(1)]);

    const victimCustomer = await db.customer.findFirstOrThrow({
      where: { workspaceId: victim.workspaceId },
      select: { id: true },
    });
    const before = await db.customerSubscription.findFirstOrThrow({ where: { customerId: victimCustomer.id } });

    await expect(
      changeCustomerAmpere({
        workspaceId: attacker.workspaceId,
        actorUserId: attacker.userId,
        customerId: victimCustomer.id,
        amperes: 99,
        tier: "NORMAL",
      }),
    ).rejects.toThrow(CrossTenantAccessError);

    const after = await db.customerSubscription.findFirstOrThrow({ where: { id: before.id } });
    expect(after.amperes).toBe(before.amperes);
    expect(after.price).toBe(before.price);

    // لا سجل تاريخي ولا سجل تدقيق زائف باسم المهاجِم.
    expect(await db.customerAmpereHistory.count({ where: { customerId: victimCustomer.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { workspaceId: attacker.workspaceId } })).toBe(0);
  });

  it("توليد فواتير بمعرّف مولدة أخرى لا يُنتج شيئًا", async () => {
    const [attacker, victim] = await Promise.all([makeWorkspace(0), makeWorkspace(4)]);

    // المهاجِم يشغّل الفوترة على مولدته — لا يمكنه لمس مشتركي الضحية.
    const result = await generateMonthlyInvoices(attacker.workspaceId, YEAR, MONTH);
    expect(result.created).toBe(0);
    expect(await db.invoice.count({ where: { workspaceId: victim.workspaceId } })).toBe(0);
  });
});
