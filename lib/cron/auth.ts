import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * تحقق موحّد من صلاحية استدعاء الـ Cron.
 *
 * يفشل مغلقًا (fail-closed): إذا لم يكن CRON_SECRET مضبوطًا يُرفض الطلب بدل السماح به —
 * المقارنة النصية المباشرة مع متغير بيئة غير معرَّف كانت تُنتج `Bearer undefined`
 * وهي قيمة يستطيع أي شخص إرسالها.
 */
export function assertCronRequest(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET غير مضبوط — تم رفض الطلب.");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  const valid =
    providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
