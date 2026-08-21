import { type NextRequest } from "next/server";
import { runCronJob } from "@/lib/cron/run";
import {
  cycleKey,
  enqueueBillingCycle,
  drainBillingJobs,
  reclaimStalledJobs,
  getCycleSummary,
} from "@/lib/domain/billing-jobs";

// حد مدة التنفيذ على Vercel. الميزانية الزمنية أدناه أقصر منه عمدًا حتى ينتهي الـ handler
// بشكل نظيف ويُرجع ملخصًا بدل أن يُقطع في المنتصف.
export const maxDuration = 60;

const DRAIN_BUDGET_MS = 45_000;

/**
 * Vercel Cron — أول كل شهر. هذا المسار "منتج" وليس منفّذًا:
 * يُدرج وحدة عمل واحدة لكل workspace نشط، ثم يبدأ معالجة ما يستطيع ضمن ميزانيته الزمنية.
 * ما لا يكتمل هنا يُكمله /api/cron/billing-worker لاحقًا — الدورة قابلة للاستئناف بالكامل.
 */
export async function GET(request: NextRequest) {
  return runCronJob("monthly-invoices", request, async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const cycle = cycleKey(year, month);

    const reclaimed = await reclaimStalledJobs();
    const { enqueued, scanned } = await enqueueBillingCycle(cycle);
    const drain = await drainBillingJobs({ budgetMs: DRAIN_BUDGET_MS });
    const summary = await getCycleSummary(cycle);

    return {
      processed: drain.processed,
      failed: drain.failed,
      pending: summary.pending + summary.processing,
      details: {
        cycle,
        year,
        month,
        workspacesScanned: scanned,
        jobsEnqueued: enqueued,
        stalledJobsReclaimed: reclaimed,
        invoicesCreated: drain.invoicesCreated,
        budgetExhausted: drain.budgetExhausted,
        summary,
      },
    };
  });
}
