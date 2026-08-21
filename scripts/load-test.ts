// اختبار حمل على مسارات الكود الحقيقية (وليس SQL مُصطنعًا).
//
// يُشغَّل عبر: pnpm load:test
//
// ⚠️ نطاق ما يقيسه هذا الاختبار — اقرأه قبل تفسير الأرقام:
//   ✅ يقيس: زمن استجابة طبقة النطاق + PostgreSQL، سلوك التزامن، تشبّع تجمّع الاتصالات،
//            نقطة انهيار قاعدة البيانات، وإنتاجية الفوترة.
//   ❌ لا يقيس: Vercel (البدء البارد، مدة الدالة، تزامن الـ instances)، ولا زمن الشبكة
//            بين Vercel وSupabase، ولا سلوك Supavisor. تلك تحتاج نشرًا على staging.
//
// أي رقم هنا هو حدّ أعلى متفائل: قاعدة البيانات محلية وزمن الشبكة صفر تقريبًا.

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error("DATABASE_URL_TEST مطلوب. شغّل عبر: pnpm load:test");
  process.exit(1);
}
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;

const db = new PrismaClient({ datasourceUrl: testUrl });

// تُستورد بعد ضبط متغيرات البيئة حتى يلتقطها عميل Prisma المشترك.
const { getDashboardStats } = await import("@/lib/domain/dashboard");
const { getReportPage } = await import("@/lib/domain/reports");
const { createCustomerWithSubscription, applyPayment, generateMonthlyInvoices } = await import("@/lib/domain/billing");
const { reserveAiRequest } = await import("@/lib/domain/ai-usage");
const { enqueueBillingCycle, drainBillingJobs, cycleKey } = await import("@/lib/domain/billing-jobs");

const WORKSPACES = Number(process.env.LOAD_WORKSPACES) || 50;
const CUSTOMERS_PER_WS = Number(process.env.LOAD_CUSTOMERS) || 200;
const LEVELS = (process.env.LOAD_LEVELS ?? "10,25,50,100,200").split(",").map(Number);
const ITERATIONS = Number(process.env.LOAD_ITERATIONS) || 300;
// مستويات سيناريو التنافس على مولدة واحدة — منفصلة لأنها تبحث عن نقطة الانهيار.
const CONTENTION_LEVELS = (process.env.LOAD_CONTENTION ?? "10,50,100").split(",").map(Number);
const SKIP_GENERAL = process.env.LOAD_SKIP_GENERAL === "yes";

type Ctx = { workspaceIds: string[]; generatorIds: Map<string, string>; userIds: Map<string, string> };

type Stats = {
  scenario: string;
  concurrency: number;
  ok: number;
  failed: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: Record<string, number>;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** يشغّل `iterations` عملية بتزامن ثابت، ويقيس توزيع زمن الاستجابة. */
async function runScenario(
  scenario: string,
  concurrency: number,
  iterations: number,
  operation: (i: number) => Promise<unknown>,
): Promise<Stats> {
  const latencies: number[] = [];
  const errors: Record<string, number> = {};
  let ok = 0;
  let failed = 0;
  let next = 0;
  const startedAt = Date.now();

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= iterations) return;
      const t0 = performance.now();
      try {
        await operation(i);
        latencies.push(performance.now() - t0);
        ok++;
      } catch (error) {
        latencies.push(performance.now() - t0);
        failed++;
        // تصنيف سبب الفشل — بلا هذا لا معنى لعمود "فشل".
        const code =
          (error as { code?: string })?.code ??
          (error as Error)?.name ??
          "Unknown";
        const message = (error as Error)?.message?.slice(0, 80) ?? "";
        const key = code === "Unknown" ? message : `${code}: ${message}`;
        errors[key] = (errors[key] ?? 0) + 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const elapsedSec = (Date.now() - startedAt) / 1000;
  latencies.sort((a, b) => a - b);

  return {
    scenario,
    concurrency,
    ok,
    failed,
    rps: Math.round((ok / elapsedSec) * 10) / 10,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(latencies[latencies.length - 1] ?? 0),
    errors,
  };
}

async function seed(): Promise<Ctx> {
  console.log(`[seed] ${WORKSPACES} مولدة × ${CUSTOMERS_PER_WS} مشترك...`);
  const workspaceIds: string[] = [];
  const generatorIds = new Map<string, string>();
  const userIds = new Map<string, string>();

  for (let w = 0; w < WORKSPACES; w++) {
    const userId = randomUUID();
    await db.user.create({ data: { id: userId, fullName: `مالك ${w}`, email: `load-${userId}@example.test` } });
    const ws = await db.workspace.create({
      data: { name: `مولدة ${w}`, ownerId: userId, status: "ACTIVE", normalAmperePriceIQD: 10_000 },
    });
    const gen = await db.generator.create({ data: { workspaceId: ws.id, name: `مولدة ${w}` } });
    const plan = await db.amperePlan.create({
      data: { workspaceId: ws.id, amperes: 5, tier: "NORMAL", monthlyPrice: 50_000, isCustom: true },
    });

    await db.customer.createMany({
      data: Array.from({ length: CUSTOMERS_PER_WS }, (_, i) => ({
        workspaceId: ws.id,
        generatorId: gen.id,
        subscriberNumber: String(i + 1).padStart(6, "0"),
        name: `مشترك ${w}-${i}`,
        phone: `0770${String(w * CUSTOMERS_PER_WS + i).padStart(7, "0")}`,
        status: "ACTIVE" as const,
      })),
    });
    await db.workspace.update({ where: { id: ws.id }, data: { subscriberSequence: CUSTOMERS_PER_WS } });

    const customers = await db.customer.findMany({ where: { workspaceId: ws.id }, select: { id: true } });
    await db.customerSubscription.createMany({
      data: customers.map((c) => ({
        customerId: c.id,
        amperePlanId: plan.id,
        amperes: 5,
        tier: "NORMAL" as const,
        price: 50_000,
        startDate: new Date(),
        status: "ACTIVE" as const,
      })),
    });

    workspaceIds.push(ws.id);
    generatorIds.set(ws.id, gen.id);
    userIds.set(ws.id, userId);
    if (w % 10 === 0) process.stdout.write(`\r[seed] ${w}/${WORKSPACES}`);
  }

  // فواتير ثلاثة أشهر لكل المولدات — لتكون القراءات على بيانات حقيقية.
  for (let m = 0; m < 3; m++) {
    for (const wsId of workspaceIds) await generateMonthlyInvoices(wsId, 2030, m + 1);
    process.stdout.write(`\r[seed] فواتير شهر ${m + 1}/3   `);
  }

  await db.$executeRawUnsafe("ANALYZE");
  const counts = {
    workspaces: await db.workspace.count(),
    customers: await db.customer.count(),
    invoices: await db.invoice.count(),
  };
  console.log(`\r[seed] جاهز: ${JSON.stringify(counts)}          `);
  return { workspaceIds, generatorIds, userIds };
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

function table(rows: Stats[]): void {
  const head = ["السيناريو", "تزامن", "نجح", "فشل", "RPS", "P50", "P95", "P99", "أقصى"];
  const widths = [34, 6, 6, 5, 8, 7, 7, 7, 7];
  console.log("\n" + head.map((h, i) => h.padEnd(widths[i]!)).join(""));
  console.log("─".repeat(widths.reduce((a, b) => a + b, 0)));
  for (const r of rows) {
    const cells = [
      r.scenario,
      String(r.concurrency),
      String(r.ok),
      String(r.failed),
      String(r.rps),
      `${r.p50}ms`,
      `${r.p95}ms`,
      `${r.p99}ms`,
      `${r.max}ms`,
    ];
    console.log(cells.map((c, i) => c.padEnd(widths[i]!)).join(""));
  }

  const withErrors = rows.filter((r) => Object.keys(r.errors).length > 0);
  if (withErrors.length > 0) {
    console.log("\n──────── تفصيل الأخطاء ────────");
    for (const r of withErrors) {
      console.log(`   ${r.scenario} @ ${r.concurrency}:`);
      for (const [key, count] of Object.entries(r.errors)) console.log(`      ${count}× ${key}`);
    }
  }
}

async function main() {
  const ctx = await seed();
  const results: Stats[] = [];

  for (const concurrency of SKIP_GENERAL ? [] : LEVELS) {
    console.log(`\n▶ مستوى التزامن: ${concurrency}`);

    results.push(
      await runScenario("A — لوحة التحكم", concurrency, ITERATIONS, (i) =>
        getDashboardStats(pick(ctx.workspaceIds, i)),
      ),
    );

    results.push(
      await runScenario("B — قائمة/بحث المشتركين", concurrency, ITERATIONS, async (i) => {
        const wsId = pick(ctx.workspaceIds, i);
        await db.customer.findMany({
          where: {
            workspaceId: wsId,
            deletedAt: null,
            OR: [{ name: { contains: `${i % 50}`, mode: "insensitive" } }, { phone: { contains: `${i % 50}` } }],
          },
          include: { subscriptions: { where: { status: "ACTIVE" }, take: 1 } },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
      }),
    );

    results.push(
      await runScenario("C — تقرير التحصيل (صفحة)", concurrency, Math.floor(ITERATIONS / 2), (i) =>
        getReportPage(pick(ctx.workspaceIds, i), "collection", {
          from: new Date(Date.UTC(2030, 0, 1)),
          to: new Date(Date.UTC(2030, 2, 31)),
        }),
      ),
    );

    results.push(
      await runScenario("D — إضافة مشترك", concurrency, Math.floor(ITERATIONS / 2), (i) => {
        const wsId = pick(ctx.workspaceIds, i);
        return createCustomerWithSubscription({
          workspaceId: wsId,
          generatorId: ctx.generatorIds.get(wsId)!,
          actorUserId: ctx.userIds.get(wsId)!,
          name: `حمل ${randomUUID().slice(0, 8)}`,
          amperes: 5,
          tier: "NORMAL",
          customerType: "NORMAL",
        });
      }),
    );

    results.push(
      await runScenario("E — حجز حصة AI", concurrency, ITERATIONS, (i) =>
        reserveAiRequest(pick(ctx.workspaceIds, i)),
      ),
    );
  }

  // إضافة متزامنة مكثفة على مولدة واحدة — أسوأ حالة تنافس على عدّاد واحد.
  console.log("\n▶ F — إضافة مشتركين متزامنة على مولدة واحدة");
  for (const concurrency of CONTENTION_LEVELS) {
    const wsId = ctx.workspaceIds[0]!;
    results.push(
      await runScenario("F — تنافس على عدّاد واحد", concurrency, concurrency, () =>
        createCustomerWithSubscription({
          workspaceId: wsId,
          generatorId: ctx.generatorIds.get(wsId)!,
          actorUserId: ctx.userIds.get(wsId)!,
          name: `تنافس ${randomUUID().slice(0, 8)}`,
          amperes: 5,
          tier: "NORMAL",
          customerType: "NORMAL",
        }),
      ),
    );
  }

  // تسجيل دفعات — يمس أقفال FOR UPDATE.
  console.log("\n▶ G — تسجيل الدفعات");
  for (const concurrency of [10, 50]) {
    const targets = await db.customer.findMany({
      where: { workspaceId: ctx.workspaceIds[1]!, invoices: { some: { status: "UNPAID" } } },
      select: { id: true },
      take: 200,
    });
    if (targets.length === 0) break;
    results.push(
      await runScenario("G — تسجيل دفعة", concurrency, Math.min(150, targets.length), (i) =>
        applyPayment({
          workspaceId: ctx.workspaceIds[1]!,
          customerId: pick(targets, i).id,
          actorUserId: ctx.userIds.get(ctx.workspaceIds[1]!)!,
          amount: 1_000,
        }),
      ),
    );
  }

  // إنتاجية الفوترة الشهرية عبر الطابور.
  console.log("\n▶ H — دورة الفوترة الشهرية عبر الطابور");
  const cycle = cycleKey(2035, 6);
  const enqueueStart = performance.now();
  const { enqueued } = await enqueueBillingCycle(cycle);
  const enqueueMs = performance.now() - enqueueStart;

  const drainStart = performance.now();
  const drains = await Promise.all([
    drainBillingJobs({ budgetMs: 120_000, workerId: "lw1", batchSize: 5 }),
    drainBillingJobs({ budgetMs: 120_000, workerId: "lw2", batchSize: 5 }),
    drainBillingJobs({ budgetMs: 120_000, workerId: "lw3", batchSize: 5 }),
  ]);
  const drainMs = performance.now() - drainStart;
  const processed = drains.reduce((s, d) => s + d.processed, 0);
  const invoices = drains.reduce((s, d) => s + d.invoicesCreated, 0);

  table(results);

  console.log("\n──────── H — الفوترة الشهرية ────────");
  console.log(`   إدراج ${enqueued} عمل: ${Math.round(enqueueMs)} ms`);
  console.log(`   معالجة ${processed} مولدة بـ 3 workers: ${Math.round(drainMs)} ms`);
  console.log(`   فواتير مُنشأة: ${invoices.toLocaleString("en")}`);
  console.log(`   الإنتاجية: ${Math.round((invoices / drainMs) * 1000).toLocaleString("en")} فاتورة/ثانية`);
  console.log(`   مولدات/ثانية: ${Math.round((processed / drainMs) * 1000 * 10) / 10}`);

  console.log("\n⚠️  هذه أرقام قاعدة البيانات محليًا فقط — لا تشمل Vercel ولا زمن الشبكة.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
