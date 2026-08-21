import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

// ============================================================
// Rate limiting عام موزّع، مبني على PostgreSQL.
//
// نفس مبدأ حدود المساعد الذكي: الفحص والزيادة عملية كتابة واحدة ذرّية، فلا يمكن
// لطلبين متزامنين تجاوز الحد. لا حالة في الذاكرة ⇒ صحيح عبر كل نسخ Vercel.
//
// يُستخدَم للمسارات العامة التي لا تملك workspaceId (التسجيل مثلًا) حيث المفتاح
// هو عنوان IP. المُعرِّف يُخزَّن مُجزَّأً — لا نُخزّن عناوين IP صريحة.
// ============================================================

export type RateLimitScope = "signup";

export type RateLimitResult = {
  allowed: boolean;
  /** ثوانٍ متبقية حتى تُفتح النافذة التالية. */
  retryAfterSeconds: number;
};

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * عنوان العميل من رؤوس الطلب. على Vercel يأتي عبر x-forwarded-for.
 * إن تعذّر تحديده نستخدم قيمة ثابتة: النتيجة أن كل الطلبات مجهولة المصدر تتقاسم
 * دلوًا واحدًا — تقييد أشد وليس أضعف، وهو الاتجاه الصحيح عند الشك.
 */
export function clientIdentifier(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
  return hashIdentifier(ip);
}

export async function consumeRateLimit(options: {
  scope: RateLimitScope;
  identifier: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { scope, identifier, limit, windowSeconds } = options;

  if (limit <= 0) return { allowed: false, retryAfterSeconds: windowSeconds };

  const windowMs = windowSeconds * 1000;
  const bucketStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketStart = new Date(bucketStartMs).toISOString();
  const retryAfterSeconds = Math.max(1, Math.ceil((bucketStartMs + windowMs - Date.now()) / 1000));

  try {
    const rows = await db.$queryRaw<{ requestCount: number }[]>`
      INSERT INTO rate_limit_buckets ("scope", "identifier", "bucketStart", "requestCount")
      VALUES (${scope}, ${identifier}, ${bucketStart}::timestamp, 1)
      ON CONFLICT ("scope", "identifier", "bucketStart")
      DO UPDATE SET "requestCount" = rate_limit_buckets."requestCount" + 1
      WHERE rate_limit_buckets."requestCount" < ${limit}
      RETURNING "requestCount";
    `;

    return { allowed: rows.length > 0, retryAfterSeconds };
  } catch (error) {
    // قاعدة البيانات غير متاحة: التسجيل نفسه لن يعمل أصلًا بدونها، فلا فائدة من منع
    // الطلب هنا. نسجّل ونمرّر — الحماية الحقيقية للبيانات هي قيود قاعدة البيانات نفسها.
    console.error("[rate-limit] check failed, allowing request", { scope, error });
    return { allowed: true, retryAfterSeconds };
  }
}

/** تنظيف النوافذ المنتهية — يمنع نمو الجدول بلا حد. */
export async function pruneRateLimitBuckets(olderThanSeconds = 86_400): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await db.rateLimitBucket.deleteMany({ where: { bucketStart: { lt: cutoff } } });
  return result.count;
}
