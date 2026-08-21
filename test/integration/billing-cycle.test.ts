import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { generateMonthlyInvoices, monthRange } from "@/lib/domain/billing";
import {
  cycleKey,
  enqueueBillingCycle,
  claimBillingJobs,
  drainBillingJobs,
  getCycleSummary,
  reclaimStalledJobs,
  processBillingJob,
} from "@/lib/domain/billing-jobs";
import { createTestWorkspace, seedCustomers, cleanupWorkspace, type TestWorkspace } from "./fixtures";

const YEAR = 2031;
const MONTH = 7;
const CYCLE = cycleKey(YEAR, MONTH);

const created: TestWorkspace[] = [];

async function makeWorkspace(customers: number) {
  const ws = await createTestWorkspace();
  created.push(ws);
  await seedCustomers(ws, customers);
  return ws;
}

afterEach(async () => {
  while (created.length > 0) await cleanupWorkspace(created.pop()!);
});

describe("اختبار C — تشغيل نفس دورة الفوترة مرتين", () => {
  it("لا يُنشئ فواتير مكررة عند إعادة التشغيل", async () => {
    const ws = await makeWorkspace(25);

    const first = await generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH);
    expect(first.created).toBe(25);

    const second = await generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(25);

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);
    const invoiceCount = await db.invoice.count({
      where: { workspaceId: ws.workspaceId, periodStart, periodEnd },
    });
    expect(invoiceCount).toBe(25);
  });

  it("تشغيل متزامن لنفس الدورة لا يُنتج فواتير مكررة", async () => {
    const ws = await makeWorkspace(30);

    const results = await Promise.all([
      generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH),
      generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH),
      generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH),
    ]);

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    expect(totalCreated).toBe(30);

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);
    const invoiceCount = await db.invoice.count({
      where: { workspaceId: ws.workspaceId, periodStart, periodEnd },
    });
    expect(invoiceCount).toBe(30);
  });

  it("يتجاوز المشتركين المحذوفين والاشتراكات غير النشطة", async () => {
    const ws = await makeWorkspace(10);

    const customers = await db.customer.findMany({ where: { workspaceId: ws.workspaceId }, take: 3 });
    await db.customer.updateMany({
      where: { id: { in: customers.map((c) => c.id) } },
      data: { deletedAt: new Date() },
    });

    const result = await generateMonthlyInvoices(ws.workspaceId, YEAR, MONTH);
    expect(result.created).toBe(7);
  });
});

describe("اختبار D — worker-ان يتنافسان على نفس الأعمال", () => {
  it("لا يسحب worker-ان نفس الـ job", async () => {
    const workspaces = await Promise.all([makeWorkspace(3), makeWorkspace(3), makeWorkspace(3), makeWorkspace(3)]);
    const ids = new Set(workspaces.map((w) => w.workspaceId));

    await enqueueBillingCycle(CYCLE);

    // سحب متزامن من عاملين مختلفين على نفس الطابور.
    const [batchA, batchB] = await Promise.all([
      claimBillingJobs(10, "worker-a"),
      claimBillingJobs(10, "worker-b"),
    ]);

    const claimedA = batchA.filter((j) => ids.has(j.workspaceId)).map((j) => j.id);
    const claimedB = batchB.filter((j) => ids.has(j.workspaceId)).map((j) => j.id);

    const overlap = claimedA.filter((id) => claimedB.includes(id));
    expect(overlap).toEqual([]);

    const allClaimed = new Set([...claimedA, ...claimedB]);
    expect(allClaimed.size).toBe(claimedA.length + claimedB.length);
  });

  it("معالجة متوازية من عدة workers تُنهي الدورة بلا تكرار", async () => {
    const workspaces = await Promise.all([makeWorkspace(5), makeWorkspace(5), makeWorkspace(5)]);
    await enqueueBillingCycle(CYCLE);

    await Promise.all([
      drainBillingJobs({ budgetMs: 30_000, workerId: "w1", batchSize: 2 }),
      drainBillingJobs({ budgetMs: 30_000, workerId: "w2", batchSize: 2 }),
      drainBillingJobs({ budgetMs: 30_000, workerId: "w3", batchSize: 2 }),
    ]);

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);
    for (const ws of workspaces) {
      const count = await db.invoice.count({
        where: { workspaceId: ws.workspaceId, periodStart, periodEnd },
      });
      expect(count).toBe(5);

      const job = await db.billingJob.findUnique({
        where: { workspaceId_cycle: { workspaceId: ws.workspaceId, cycle: CYCLE } },
      });
      expect(job?.status).toBe("DONE");
      expect(job?.attempts).toBe(1);
    }
  });

  it("إدراج الدورة مرتين لا يُنشئ عملًا مكررًا لنفس workspace", async () => {
    const ws = await makeWorkspace(2);

    await enqueueBillingCycle(CYCLE);
    await enqueueBillingCycle(CYCLE);

    const jobs = await db.billingJob.count({ where: { workspaceId: ws.workspaceId, cycle: CYCLE } });
    expect(jobs).toBe(1);
  });
});

describe("استئناف الدورة بعد انقطاع", () => {
  it("العمل العالق في PROCESSING يعود PENDING ويكتمل لاحقًا", async () => {
    const ws = await makeWorkspace(4);
    await enqueueBillingCycle(CYCLE);

    // محاكاة موت الـ function: العمل مسحوب لكن لم يُعالَج ولم يُحرَّر قفله.
    const claimed = await claimBillingJobs(20, "dead-worker");
    expect(claimed.some((j) => j.workspaceId === ws.workspaceId)).toBe(true);

    await db.billingJob.update({
      where: { workspaceId_cycle: { workspaceId: ws.workspaceId, cycle: CYCLE } },
      data: { lockedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const reclaimed = await reclaimStalledJobs(60);
    expect(reclaimed).toBeGreaterThanOrEqual(1);

    await drainBillingJobs({ budgetMs: 30_000, workerId: "recovery-worker" });

    const job = await db.billingJob.findUnique({
      where: { workspaceId_cycle: { workspaceId: ws.workspaceId, cycle: CYCLE } },
    });
    expect(job?.status).toBe("DONE");

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);
    const invoices = await db.invoice.count({
      where: { workspaceId: ws.workspaceId, periodStart, periodEnd },
    });
    expect(invoices).toBe(4);
  });

  it("ملخص الدورة يعكس الحالة الفعلية", async () => {
    // دورة خاصة بهذا الاختبار: getCycleSummary يقرأ حالة كل المنصّة لتلك الدورة،
    // فمشاركتها مع اختبارات أخرى تجعل التوكيد يعتمد على ترتيب التنفيذ.
    const OWN_CYCLE = cycleKey(YEAR, 11);
    const ws = await makeWorkspace(2);
    await enqueueBillingCycle(OWN_CYCLE);
    await drainBillingJobs({ budgetMs: 30_000 });

    const summary = await getCycleSummary(OWN_CYCLE);
    expect(summary.cycle).toBe(OWN_CYCLE);
    expect(summary.done).toBeGreaterThanOrEqual(1);
    expect(summary.pending).toBe(0);
    expect(summary.processing).toBe(0);
    expect(ws.workspaceId).toBeTruthy();
  });
});

// ============================================================
// مسار الفشل وإعادة المحاولة — كُتب في processBillingJob ولم يُختبر حتى الآن.
// نُجبر الفشل بدورة غير صالحة الصيغة: parseCycle يرمي قبل أي كتابة، فيسلك العمل
// نفس المسار الذي يسلكه أي خطأ حقيقي (تعذّر الاتصال، خطأ منطقي، ...).
// ============================================================
describe("فشل الأعمال وإعادة المحاولة", () => {
  async function jobWithBadCycle(maxAttempts: number) {
    const ws = await makeWorkspace(1);
    const job = await db.billingJob.create({
      data: { workspaceId: ws.workspaceId, cycle: "صيغة-خاطئة", maxAttempts },
    });
    return { ws, job };
  }

  it("الفشل الأول يُعيد العمل PENDING مع backoff وسبب مسجَّل", async () => {
    const { job } = await jobWithBadCycle(3);

    const claimed = await claimBillingJobs(50, "failing-worker");
    const mine = claimed.find((j) => j.id === job.id);
    expect(mine).toBeDefined();

    const result = await processBillingJob(mine!);
    expect(result.ok).toBe(false);

    const after = await db.billingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(1);
    expect(after.error).toBeTruthy();
    expect(after.lockedBy).toBeNull();
    // backoff: لا يُسحب فورًا مرة أخرى.
    expect(after.runAfter.getTime()).toBeGreaterThan(Date.now());
  });

  it("العمل المؤجَّل بـ backoff لا يُسحب قبل موعده", async () => {
    const { job } = await jobWithBadCycle(3);
    await db.billingJob.update({
      where: { id: job.id },
      data: { runAfter: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const claimed = await claimBillingJobs(50, "early-worker");
    expect(claimed.find((j) => j.id === job.id)).toBeUndefined();
  });

  it("استنفاد maxAttempts يُحوّل العمل إلى FAILED مع سبب دائم", async () => {
    const { job } = await jobWithBadCycle(1); // محاولة واحدة مسموحة

    const claimed = await claimBillingJobs(50, "last-chance");
    const mine = claimed.find((j) => j.id === job.id)!;
    expect(mine.attempts).toBe(1);
    expect(mine.attempts).toBeGreaterThanOrEqual(mine.maxAttempts);

    await processBillingJob(mine);

    const after = await db.billingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failedAt).not.toBeNull();
    expect(after.error).toBeTruthy();
    expect(after.lockedBy).toBeNull();
  });

  it("العمل FAILED لا يُسحب مجددًا ولا يُعاد تنفيذه تلقائيًا", async () => {
    const { job } = await jobWithBadCycle(1);
    const claimed = await claimBillingJobs(50, "w");
    await processBillingJob(claimed.find((j) => j.id === job.id)!);

    const again = await claimBillingJobs(50, "another-worker");
    expect(again.find((j) => j.id === job.id)).toBeUndefined();

    // ولا يُعيده مُسترجع الأعمال العالقة (هو ليس PROCESSING).
    await reclaimStalledJobs(0);
    const after = await db.billingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("FAILED");
  });

  it("فشل مولدة واحدة لا يمنع اكتمال بقية المولدات في نفس الدورة", async () => {
    const healthy = await Promise.all([makeWorkspace(3), makeWorkspace(3)]);
    const broken = await makeWorkspace(1);

    await enqueueBillingCycle(CYCLE);
    // نُفسد عمل مولدة واحدة فقط.
    await db.billingJob.update({
      where: { workspaceId_cycle: { workspaceId: broken.workspaceId, cycle: CYCLE } },
      data: { cycle: "تالف", maxAttempts: 1 },
    });

    await drainBillingJobs({ budgetMs: 30_000, workerId: "mixed" });

    const { periodStart, periodEnd } = monthRange(YEAR, MONTH);
    for (const ws of healthy) {
      const count = await db.invoice.count({
        where: { workspaceId: ws.workspaceId, periodStart, periodEnd },
      });
      expect(count).toBe(3);
      const job = await db.billingJob.findUniqueOrThrow({
        where: { workspaceId_cycle: { workspaceId: ws.workspaceId, cycle: CYCLE } },
      });
      expect(job.status).toBe("DONE");
    }

    const brokenJob = await db.billingJob.findFirstOrThrow({ where: { workspaceId: broken.workspaceId } });
    expect(brokenJob.status).toBe("FAILED");
  });
});
