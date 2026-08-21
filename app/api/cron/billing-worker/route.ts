import { type NextRequest } from "next/server";
import { runCronJob } from "@/lib/cron/run";
import { cycleKey, drainBillingJobs, reclaimStalledJobs, getCycleSummary } from "@/lib/domain/billing-jobs";

export const maxDuration = 60;

const DRAIN_BUDGET_MS = 45_000;

/**
 * مستهلك الطابور. يعمل بتكرار عالٍ ويكمل ما تبقى من دورة الفوترة الحالية.
 * تشغيل أكثر من نسخة منه بالتوازي آمن: السحب ذرّي عبر FOR UPDATE SKIP LOCKED،
 * فلا يمكن لاثنين معالجة نفس الـ job.
 * إذا لم يكن هناك عمل معلّق ينتهي فورًا بلا أي تكلفة تُذكر.
 */
export async function GET(request: NextRequest) {
  return runCronJob("billing-worker", request, async () => {
    const now = new Date();
    const cycle = cycleKey(now.getUTCFullYear(), now.getUTCMonth() + 1);

    const reclaimed = await reclaimStalledJobs();
    const drain = await drainBillingJobs({ budgetMs: DRAIN_BUDGET_MS });
    const summary = await getCycleSummary(cycle);

    return {
      processed: drain.processed,
      failed: drain.failed,
      pending: summary.pending + summary.processing,
      details: {
        cycle,
        stalledJobsReclaimed: reclaimed,
        invoicesCreated: drain.invoicesCreated,
        budgetExhausted: drain.budgetExhausted,
        summary,
      },
    };
  });
}
