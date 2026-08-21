import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "@/lib/domain/billing";

// ============================================================
// حماية المساعد الذكي: حصة شهرية لكل خطة + rate limit لكل workspace.
//
// كل العدّادات في PostgreSQL وكل زيادة ذرّية (INSERT ... ON CONFLICT DO UPDATE ... WHERE).
// لا توجد أي حالة في الذاكرة — النتيجة صحيحة عبر أي عدد من نسخ Vercel المتزامنة،
// ولا يمكن لطلبين متزامنين أن يتجاوزا الحد لأن الشرط جزء من عبارة الكتابة نفسها.
// ============================================================

export const AI_USAGE_METRIC = "ai_requests";

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * الحدود تُقرأ عند كل استدعاء وليس عند تحميل الموديول: القراءة مرة واحدة تُجمّد القيمة
 * لعمر العملية، فيستحيل اختبار كل حدّ بمعزل عن الآخر. تكلفة قراءة متغير بيئة لا تُذكر
 * أمام استدعاء قاعدة بيانات.
 */
function rateLimitWindowSeconds(): number {
  return readPositiveInt(process.env.AI_RATE_LIMIT_WINDOW_SECONDS, 60);
}

/** أقصى عدد طلبات لكل workspace داخل النافذة الواحدة. */
function rateLimitMaxRequests(): number {
  return readPositiveInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10);
}

export const AI_QUOTA_EXCEEDED_MESSAGE =
  "لقد وصلت إلى الحد المسموح لاستخدام الذكاء الاصطناعي ضمن خطتك الحالية.";

export const AI_RATE_LIMITED_MESSAGE =
  "طلبات كثيرة على المساعد الذكي خلال وقت قصير. انتظر دقيقة ثم حاول مجددًا.";

export type AiQuotaDenial = { allowed: false; reason: "QUOTA" | "RATE_LIMIT"; message: string };
export type AiQuotaGrant = { allowed: true; limit: number | null; used: number };
export type AiQuotaResult = AiQuotaGrant | AiQuotaDenial;

function currentPeriod() {
  const now = new Date();
  return monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function currentBucketStart(): Date {
  const now = Date.now();
  const windowMs = rateLimitWindowSeconds() * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/**
 * الحد الشهري المطبَّق على هذا الـ workspace.
 * - خطة بها aiRequestLimit ⇒ الحد من الخطة.
 * - خطة بلا حد محدد (null) ⇒ بلا حد.
 * - لا يوجد اشتراك منصّة بعد ⇒ يُطبَّق AI_DEFAULT_MONTHLY_LIMIT إن ضُبط، وإلا بلا حد.
 *   (يحافظ على السلوك القائم في canUseLimit: الوصول مفتوح حتى يُفعَّل نظام الباقات.)
 */
export async function resolveAiMonthlyLimit(workspaceId: string): Promise<number | null> {
  const subscription = await db.platformSubscription.findUnique({
    where: { workspaceId },
    select: { plan: { select: { aiRequestLimit: true } } },
  });

  if (!subscription) {
    const fallback = Number(process.env.AI_DEFAULT_MONTHLY_LIMIT);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }

  return subscription.plan.aiRequestLimit ?? null;
}

/**
 * زيادة ذرّية لعدّاد النافذة. يُرجع false إذا كانت النافذة ممتلئة.
 * الشرط `WHERE "requestCount" < limit` داخل DO UPDATE هو ما يجعل الفحص والزيادة عملية واحدة
 * غير قابلة للانقسام — لا نافذة سباق بين قراءة العدّاد وكتابته.
 */
async function consumeRateLimit(workspaceId: string): Promise<boolean> {
  const maxRequests = rateLimitMaxRequests();
  if (maxRequests <= 0) return false;

  const bucketStart = currentBucketStart().toISOString();

  const rows = await db.$queryRaw<{ requestCount: number }[]>`
    INSERT INTO ai_rate_limit_buckets ("workspaceId", "bucketStart", "requestCount")
    VALUES (${workspaceId}::uuid, ${bucketStart}::timestamp, 1)
    ON CONFLICT ("workspaceId", "bucketStart")
    DO UPDATE SET "requestCount" = ai_rate_limit_buckets."requestCount" + 1
    WHERE ai_rate_limit_buckets."requestCount" < ${maxRequests}
    RETURNING "requestCount";
  `;

  return rows.length > 0;
}

/**
 * حجز طلب واحد من الحصة الشهرية، بشكل ذرّي.
 * يُرجع عدد الطلبات المستهلكة بعد الحجز، أو null إذا كان الحد قد استُنفد.
 */
async function reserveMonthlyQuota(workspaceId: string, limit: number | null): Promise<number | null> {
  const { periodStart, periodEnd } = currentPeriod();
  const start = periodStart.toISOString();
  const end = periodEnd.toISOString();

  if (limit === null) {
    // بلا حد — نُسجّل الاستهلاك فقط (مطلوب للفوترة والتقارير) دون أي شرط.
    const rows = await db.$queryRaw<{ value: number }[]>`
      INSERT INTO usage_records ("id", "workspaceId", "metric", "value", "periodStart", "periodEnd", "createdAt")
      VALUES (gen_random_uuid(), ${workspaceId}::uuid, ${AI_USAGE_METRIC}, 1, ${start}::timestamp, ${end}::timestamp, (now() AT TIME ZONE 'UTC'))
      ON CONFLICT ("workspaceId", "metric", "periodStart", "periodEnd")
      DO UPDATE SET "value" = usage_records."value" + 1
      RETURNING "value";
    `;
    return rows[0]?.value ?? null;
  }

  if (limit <= 0) return null;

  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO usage_records ("id", "workspaceId", "metric", "value", "periodStart", "periodEnd", "createdAt")
    VALUES (gen_random_uuid(), ${workspaceId}::uuid, ${AI_USAGE_METRIC}, 1, ${start}::timestamp, ${end}::timestamp, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("workspaceId", "metric", "periodStart", "periodEnd")
    DO UPDATE SET "value" = usage_records."value" + 1
    WHERE usage_records."value" < ${limit}
    RETURNING "value";
  `;

  return rows[0]?.value ?? null;
}

/**
 * إرجاع الحجز عند فشل الطلب — حتى لا يُحتسب على المستخدم استدعاء لم ينجح.
 * best-effort: فشله لا يمنع إرجاع رسالة الخطأ للمستخدم.
 */
export async function releaseAiQuota(workspaceId: string): Promise<void> {
  const { periodStart, periodEnd } = currentPeriod();
  try {
    await db.$executeRaw`
      UPDATE usage_records
      SET "value" = GREATEST("value" - 1, 0)
      WHERE "workspaceId" = ${workspaceId}::uuid
        AND "metric" = ${AI_USAGE_METRIC}
        AND "periodStart" = ${periodStart.toISOString()}::timestamp
        AND "periodEnd" = ${periodEnd.toISOString()}::timestamp;
    `;
  } catch (error) {
    console.error("[ai-usage] failed to release quota", { workspaceId, error });
  }
}

/**
 * البوابة الوحيدة قبل أي استدعاء لمزوّد الذكاء الاصطناعي.
 * الترتيب مقصود: الـ rate limit أولًا (أرخص ويحمي من الانفجار المفاجئ)، ثم حجز الحصة الشهرية.
 */
export async function reserveAiRequest(workspaceId: string): Promise<AiQuotaResult> {
  const withinRate = await consumeRateLimit(workspaceId);
  if (!withinRate) {
    return { allowed: false, reason: "RATE_LIMIT", message: AI_RATE_LIMITED_MESSAGE };
  }

  const limit = await resolveAiMonthlyLimit(workspaceId);
  const used = await reserveMonthlyQuota(workspaceId, limit);

  if (used === null) {
    return { allowed: false, reason: "QUOTA", message: AI_QUOTA_EXCEEDED_MESSAGE };
  }

  return { allowed: true, limit, used };
}

/** تنظيف نوافذ الـ rate limit المنتهية — يمنع نمو الجدول بلا حد. */
export async function pruneAiRateLimitBuckets(olderThanSeconds = 3600): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await db.aiRateLimitBucket.deleteMany({ where: { bucketStart: { lt: cutoff } } });
  return result.count;
}
