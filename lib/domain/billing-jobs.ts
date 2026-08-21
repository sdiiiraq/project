import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateMonthlyInvoices } from "@/lib/domain/billing";
import { notifyWorkspace } from "@/lib/domain/notifications";

// ============================================================
// طابور فوترة مبني على PostgreSQL — بلا بنية تحتية خارجية.
//
// الـ Cron لم يعد ينفّذ الفوترة بنفسه: هو "منتج" يُدرج وحدة عمل واحدة لكل workspace،
// والـ worker "مستهلك" يسحبها بشكل ذرّي عبر FOR UPDATE SKIP LOCKED. النتيجة:
//   • لا حلقة تسلسلية واحدة تحاول إنهاء آلاف المولدات في invocation واحد.
//   • إذا مات الـ function في المنتصف، الأعمال غير المكتملة تبقى PENDING/PROCESSING
//     ويستكملها الاستدعاء التالي — الدورة قابلة للاستئناف.
//   • worker-ان متزامنان لا يمكن أن يعالجا نفس الـ job (SKIP LOCKED).
// ============================================================

// أعمدة DateTime في Prisma من نوع timestamp بلا منطقة زمنية، وPrisma يكتب فيها ويقرأ
// منها بتوقيت UTC دائمًا. أما now() في PostgreSQL فنوعها timestamptz، فمقارنتها بالعمود
// تُحوِّل العمود حسب منطقة زمنية الجلسة — وعلى جلسة بتوقيت +03 يبدو وقت UTC أقدم بثلاث
// ساعات مما هو. النتيجة المقيسة: عمل مؤجَّل ساعة كاملة كان يُسحب فورًا، أي أن الـ backoff
// كان مُعطَّلًا فعليًا، وكذلك كشف الأقفال الميتة. now() AT TIME ZONE 'UTC' يُعيد timestamp
// بتوقيت UTC، فيطابق ما يكتبه Prisma تمامًا.
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

const WORKSPACE_ENQUEUE_BATCH = 1_000;

// أقصى مدة يُسمح لها بالبقاء في PROCESSING قبل اعتبار القفل ميتًا (function مات دون تحرير القفل).
const STALE_LOCK_SECONDS = 15 * 60;

export type BillingJobRow = {
  id: string;
  workspaceId: string;
  cycle: string;
  attempts: number;
  maxAttempts: number;
};

/** مفتاح دورة الفوترة: "YYYY-MM" */
export function cycleKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseCycle(cycle: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(cycle);
  if (!match) throw new Error(`دورة فوترة غير صالحة: ${cycle}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** backoff أسّي مع jitter — يمنع اصطفاف كل الأعمال الفاشلة على نفس اللحظة. */
function backoffMs(attempts: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
  return base + Math.floor(Math.random() * 10_000);
}

/**
 * المنتج: يُدرج job واحدًا لكل workspace نشط لهذه الدورة.
 * القيد @@unique([workspaceId, cycle]) + skipDuplicates يجعل الاستدعاء المتكرر بلا أثر —
 * وهو ما يمنع فوترة نفس المولدة مرتين لنفس الشهر حتى لو شغّل Vercel الـ cron أكثر من مرة.
 */
export async function enqueueBillingCycle(cycle: string): Promise<{ enqueued: number; scanned: number }> {
  let enqueued = 0;
  let scanned = 0;
  let cursor: string | undefined;

  for (;;) {
    const workspaces = await db.workspace.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
      orderBy: { id: "asc" },
      take: WORKSPACE_ENQUEUE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (workspaces.length === 0) break;

    scanned += workspaces.length;
    cursor = workspaces[workspaces.length - 1]!.id;

    const result = await db.billingJob.createMany({
      data: workspaces.map((w) => ({ workspaceId: w.id, cycle })),
      skipDuplicates: true,
    });
    enqueued += result.count;

    if (workspaces.length < WORKSPACE_ENQUEUE_BATCH) break;
  }

  return { enqueued, scanned };
}

/**
 * سحب ذرّي للأعمال. UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING
 * في عبارة واحدة — لا يوجد SELECT ثم UPDATE منفصلان، فلا نافذة سباق بين worker-ين.
 */
export async function claimBillingJobs(limit: number, workerId: string): Promise<BillingJobRow[]> {
  return db.$queryRaw<BillingJobRow[]>`
    UPDATE billing_jobs
    SET status = 'PROCESSING'::"BillingJobStatus",
        "lockedAt" = ${NOW_UTC},
        "lockedBy" = ${workerId},
        "startedAt" = COALESCE("startedAt", ${NOW_UTC}),
        attempts = attempts + 1,
        "updatedAt" = ${NOW_UTC}
    WHERE id IN (
      SELECT id FROM billing_jobs
      WHERE status = 'PENDING'::"BillingJobStatus"
        AND "runAfter" <= ${NOW_UTC}
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "workspaceId", cycle, attempts, "maxAttempts";
  `;
}

/**
 * استرجاع الأعمال العالقة في PROCESSING بسبب موت الـ function دون تحرير القفل.
 * بدون هذا، أي انقطاع في منتصف التنفيذ يترك عملًا محجوزًا للأبد.
 */
export async function reclaimStalledJobs(staleSeconds: number = STALE_LOCK_SECONDS): Promise<number> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE billing_jobs
    SET status = 'PENDING'::"BillingJobStatus",
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "runAfter" = ${NOW_UTC},
        "updatedAt" = ${NOW_UTC}
    WHERE status = 'PROCESSING'::"BillingJobStatus"
      AND "lockedAt" < ${NOW_UTC} - (${staleSeconds} * interval '1 second')
    RETURNING id;
  `;
  return rows.length;
}

/**
 * تنفيذ عمل واحد. العملية idempotent بالكامل: إعادة تشغيلها لا تُنتج فواتير مكررة
 * (قيد @@unique([customerId, periodStart, periodEnd]) + createMany skipDuplicates).
 */
export async function processBillingJob(job: BillingJobRow): Promise<{ ok: boolean; created: number; error?: string }> {
  let month = 0;

  try {
    // parseCycle كان يُستدعى خارج try: أي عمل بدورة تالفة كان يرمي من الدالة كلها،
    // فيتجاوز منطق إعادة المحاولة ويبقى عالقًا في PROCESSING إلى الأبد — والأسوأ أنه
    // كان يُسقط حلقة drain بأكملها فيمنع فوترة كل المولدات الأخرى في تلك الدورة.
    const parsed = parseCycle(job.cycle);
    month = parsed.month;

    const result = await generateMonthlyInvoices(job.workspaceId, parsed.year, month);

    await db.billingJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        completedAt: new Date(),
        invoicesCreated: result.created,
        error: null,
        lockedAt: null,
        lockedBy: null,
      },
    });

    // الإشعار تجميلي ولا يؤثر على صحة الفوترة — فشله لا يُعيد العمل إلى الطابور
    // ولا يُلغي فواتير أُنشئت فعلًا.
    if (result.created > 0) {
      try {
        await notifyWorkspace({
          workspaceId: job.workspaceId,
          type: "SUBSCRIPTION",
          title: "موعد استلام الاشتراك",
          body: `تم إصدار ${result.created} فاتورة اشتراك لهذا الشهر (شهر ${month}). حان موعد التحصيل.`,
        });
      } catch (notifyError) {
        console.error("[billing-jobs] notification failed", { jobId: job.id, error: notifyError });
      }
    }

    return { ok: true, created: result.created };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = job.attempts >= job.maxAttempts;

    await db.billingJob.update({
      where: { id: job.id },
      data: exhausted
        ? { status: "FAILED", failedAt: new Date(), error: message.slice(0, 1000), lockedAt: null, lockedBy: null }
        : {
            status: "PENDING",
            runAfter: new Date(Date.now() + backoffMs(job.attempts)),
            error: message.slice(0, 1000),
            lockedAt: null,
            lockedBy: null,
          },
    });

    console.error("[billing-jobs] job failed", { jobId: job.id, attempts: job.attempts, exhausted, error: message });
    return { ok: false, created: 0, error: message };
  }
}

export type DrainResult = {
  workerId: string;
  processed: number;
  succeeded: number;
  failed: number;
  invoicesCreated: number;
  durationMs: number;
  budgetExhausted: boolean;
};

/**
 * حلقة الـ worker محكومة بميزانية زمنية — تتوقف عن سحب أعمال جديدة قبل بلوغ حد مدة
 * تنفيذ Vercel، وتترك الباقي PENDING للاستدعاء التالي. الدفعة المسحوبة تُعالَج كاملة دائمًا
 * حتى لا يبقى عمل محجوزًا (PROCESSING) بلا معالجة.
 */
export async function drainBillingJobs(options: {
  budgetMs: number;
  batchSize?: number;
  workerId?: string;
}): Promise<DrainResult> {
  const workerId = options.workerId ?? randomUUID();
  const batchSize = options.batchSize ?? 5;
  const startedAt = Date.now();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let invoicesCreated = 0;
  let budgetExhausted = false;

  for (;;) {
    if (Date.now() - startedAt >= options.budgetMs) {
      budgetExhausted = true;
      break;
    }

    const jobs = await claimBillingJobs(batchSize, workerId);
    if (jobs.length === 0) break;

    for (const job of jobs) {
      processed += 1;
      try {
        const result = await processBillingJob(job);
        if (result.ok) {
          succeeded += 1;
          invoicesCreated += result.created;
        } else {
          failed += 1;
        }
      } catch (error) {
        // حزام أمان: processBillingJob يلتقط أخطاءه بنفسه، لكن أي خطأ غير متوقع
        // (تعذّر تحديث سجل العمل مثلًا) يجب ألا يُسقط الدفعة كلها ويمنع بقية المولدات.
        failed += 1;
        console.error("[billing-jobs] unexpected error, batch continues", { jobId: job.id, error });
      }
    }
  }

  return {
    workerId,
    processed,
    succeeded,
    failed,
    invoicesCreated,
    durationMs: Date.now() - startedAt,
    budgetExhausted,
  };
}

/** ملخص حالة الدورة — للمراقبة والتحقق من اكتمالها. */
export async function getCycleSummary(cycle: string) {
  const grouped = await db.billingJob.groupBy({
    by: ["status"],
    where: { cycle },
    _count: { _all: true },
    _sum: { invoicesCreated: true },
  });

  const summary = { cycle, pending: 0, processing: 0, done: 0, failed: 0, invoicesCreated: 0 };
  for (const row of grouped) {
    const count = row._count._all;
    if (row.status === "PENDING") summary.pending = count;
    if (row.status === "PROCESSING") summary.processing = count;
    if (row.status === "DONE") summary.done = count;
    if (row.status === "FAILED") summary.failed = count;
    summary.invoicesCreated += Number(row._sum.invoicesCreated ?? 0);
  }
  return summary;
}
