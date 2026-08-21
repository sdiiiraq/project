import "server-only";
import { db } from "@/lib/db";

// ============================================================
// سياسة الاحتفاظ بالبيانات التشغيلية.
//
// عدة جداول تُكتب دوريًا ولا تتقلّص أبدًا. عند آلاف المولدات تصبح أكبر جداول المنصّة
// دون أن تحمل قيمة بعد فترة. التنظيف هنا يجري ضمن الـ cron اليومي على دفعات محدودة.
//
// ما لا يُحذف إطلاقًا — ومبرر ذلك:
//   • AuditLog       سجل أمني ومالي. حذفه يُفقد القدرة على التحقيق ويكسر متطلبات
//                    التدقيق. ينمو، ونعالج ذلك بالتصفيح والفهرسة لا بالحذف.
//   • Invoice/Payment/LedgerEntry  سجل مالي دائم بحكم التصميم.
//   • BillingJob FAILED            يُحتفظ به بلا حد: هو الدليل الوحيد على دورة فوترة
//                                  لم تكتمل، وحذفه يعني فقدان المشكلة بصمت.
//   • الإشعارات غير المقروءة       لم يرَها المستخدم بعد.
// ============================================================

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** سقف الحذف في التشغيل الواحد — يمنع قفل الجدول طويلًا أو تجاوز مهلة الـ cron. */
const MAX_DELETE_PER_RUN = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoff(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/**
 * سجلات تشغيل المهام المجدولة — بيانات قياس بحتة.
 * بتكرار كل 5 دقائق تنتج ~105 ألف صف سنويًا بلا قيمة بعد أسابيع.
 * سجلات FAILED تُستثنى: هي مؤشر أعطال يستحق البقاء أطول.
 */
export async function pruneCronRuns(): Promise<number> {
  const days = readPositiveInt(process.env.RETENTION_CRON_RUNS_DAYS, 30);
  const ids = await db.cronRun.findMany({
    where: { startedAt: { lt: cutoff(days) }, status: { not: "FAILED" } },
    select: { id: true },
    take: MAX_DELETE_PER_RUN,
  });
  if (ids.length === 0) return 0;
  const result = await db.cronRun.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  return result.count;
}

/**
 * أعمال الفوترة المكتملة. الفواتير نفسها هي السجل الدائم — العمل مجرد وحدة تنفيذ.
 * الافتراضي 90 يومًا (ثلاث دورات فوترة) حتى يبقى تاريخ قريب متاحًا للمراجعة.
 *
 * آمن لأن إعادة إدراج دورة قديمة بعد حذف عملها لا تُنتج فواتير مكررة:
 * generateMonthlyInvoices يعتمد على @@unique([customerId, periodStart, periodEnd]).
 */
export async function pruneCompletedBillingJobs(): Promise<number> {
  const days = readPositiveInt(process.env.RETENTION_BILLING_JOBS_DAYS, 90);
  const ids = await db.billingJob.findMany({
    where: { status: "DONE", completedAt: { lt: cutoff(days) } },
    select: { id: true },
    take: MAX_DELETE_PER_RUN,
  });
  if (ids.length === 0) return 0;
  const result = await db.billingJob.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  return result.count;
}

/**
 * الإشعارات المقروءة فقط. الإشعار حالة واجهة مؤقتة لا سجل مالي، وبعد قراءته بأشهر
 * لا يحمل قيمة. غير المقروءة تبقى مهما طال عمرها.
 */
export async function pruneReadNotifications(): Promise<number> {
  const days = readPositiveInt(process.env.RETENTION_READ_NOTIFICATIONS_DAYS, 90);
  const ids = await db.notification.findMany({
    where: { readAt: { not: null, lt: cutoff(days) } },
    select: { id: true },
    take: MAX_DELETE_PER_RUN,
  });
  if (ids.length === 0) return 0;
  const result = await db.notification.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  return result.count;
}

export type RetentionResult = {
  cronRuns: number;
  billingJobs: number;
  readNotifications: number;
};

/** ينفّذ كل سياسات الاحتفاظ. فشل أي منها لا يُسقط المهمة المجدولة. */
export async function runRetention(): Promise<RetentionResult> {
  const [cronRuns, billingJobs, readNotifications] = await Promise.all([
    pruneCronRuns().catch(() => 0),
    pruneCompletedBillingJobs().catch(() => 0),
    pruneReadNotifications().catch(() => 0),
  ]);
  return { cronRuns, billingJobs, readNotifications };
}
