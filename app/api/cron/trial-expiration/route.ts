import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runCronJob } from "@/lib/cron/run";

export const maxDuration = 60;

const CHUNK = 500;

// Vercel Cron — يومي: يحوّل الاشتراكات التجريبية المنتهية إلى EXPIRED.
// لا تعتمد على الواجهة الأمامية لتحديد انتهاء التجربة.
//
// يعمل على دفعات: قراءة محدودة بـ take، ثم updateMany + createMany لكل دفعة —
// بدل UPDATE وINSERT منفصلين لكل اشتراك.
export async function GET(request: NextRequest) {
  return runCronJob("trial-expiration", request, async () => {
    let expired = 0;
    let notified = 0;

    for (;;) {
      const batch = await db.platformSubscription.findMany({
        where: { status: "TRIAL", trialEnd: { lt: new Date() } },
        select: { id: true, workspaceId: true },
        orderBy: { id: "asc" },
        take: CHUNK,
      });

      if (batch.length === 0) break;

      const ids = batch.map((s) => s.id);

      // الشرط status: "TRIAL" مُكرَّر هنا عمدًا: لو غيّر تشغيل متزامن الحالة بين القراءة
      // والكتابة، لن يُحدَّث السجل مرتين ولن يُحتسب مرتين.
      const result = await db.platformSubscription.updateMany({
        where: { id: { in: ids }, status: "TRIAL" },
        data: { status: "EXPIRED" },
      });
      expired += result.count;

      if (result.count > 0) {
        const written = await db.notification.createMany({
          data: batch.map((sub) => ({
            workspaceId: sub.workspaceId,
            userId: null,
            type: "SUBSCRIPTION",
            title: "انتهت الفترة التجريبية",
            body: "انتهت الفترة التجريبية لاشتراكك في أمبير. يرجى ترقية الباقة لمتابعة استخدام الميزات المدفوعة.",
          })),
        });
        notified += written.count;
      }

      // الدفعة المعالَجة لم تعد تطابق الفلتر (لم تعد TRIAL)، فالاستعلام التالي يبدأ من الباقي.
      // إن لم يتغيّر أي سجل فهذا يعني أن جهة أخرى عالجتها بالفعل — نتوقف لتفادي حلقة لانهائية.
      if (result.count === 0 || batch.length < CHUNK) break;
    }

    return { processed: expired, details: { expired, notified } };
  });
}
