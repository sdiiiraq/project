import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertCronRequest } from "@/lib/cron/auth";
import { log } from "@/lib/observability/logger";

export type CronJobName = "monthly-invoices" | "billing-worker" | "daily-notifications" | "trial-expiration";

export type CronOutcome = {
  processed?: number;
  failed?: number;
  pending?: number;
  details?: Record<string, unknown>;
};

/**
 * غلاف موحّد لكل المهام المجدولة:
 *   • تحقق الصلاحية (fail-closed) قبل أي عمل
 *   • تسجيل بداية التنفيذ في cron_runs فورًا — فالانقطاع الصامت يبقى مرئيًا كسجل RUNNING عالق
 *   • قياس المدة، وتسجيل عدد ما نُفّذ وما فشل وما بقي معلقًا
 *   • التقاط أي استثناء وتسجيله كـ FAILED مع السبب، ثم إرجاع 500 بدل انهيار صامت
 *
 * فشل تسجيل المراقبة نفسه لا يُفشل المهمة: المراقبة لا تُعطّل العمل.
 */
export async function runCronJob(
  job: CronJobName,
  request: NextRequest,
  handler: () => Promise<CronOutcome>,
): Promise<NextResponse> {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const startedAt = new Date();

  const run = await db.cronRun
    .create({ data: { job, status: "RUNNING", startedAt } })
    .catch((error) => {
      log.error("cron.run_record_failed", { job, error });
      return null;
    });

  try {
    const outcome = await handler();
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    if (run) {
      await db.cronRun
        .update({
          where: { id: run.id },
          data: {
            status: "SUCCESS",
            completedAt,
            durationMs,
            processed: outcome.processed ?? 0,
            failed: outcome.failed ?? 0,
            pending: outcome.pending ?? 0,
            details: (outcome.details ?? {}) as object,
          },
        })
        .catch((error) => log.error("cron.run_update_failed", { job, error }));
    }

    log.info("cron.completed", {
      job,
      durationMs,
      processed: outcome.processed ?? 0,
      failed: outcome.failed ?? 0,
      pending: outcome.pending ?? 0,
      ...outcome.details,
    });

    return NextResponse.json({
      job,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      processed: outcome.processed ?? 0,
      failed: outcome.failed ?? 0,
      pending: outcome.pending ?? 0,
      ...outcome.details,
    });
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : String(error);

    if (run) {
      await db.cronRun
        .update({
          where: { id: run.id },
          data: { status: "FAILED", completedAt, durationMs, error: message.slice(0, 1000) },
        })
        .catch((updateError) => log.error("cron.run_update_failed", { job, error: updateError }));
    }

    log.error("cron.failed", { job, durationMs, error });
    return NextResponse.json({ job, error: "فشل تنفيذ المهمة المجدولة." }, { status: 500 });
  }
}
