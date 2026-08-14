import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifyWorkspace } from "@/lib/domain/notifications";

// Vercel Cron — يومي: يحوّل الاشتراكات التجريبية المنتهية إلى EXPIRED.
// لا تعتمد على الواجهة الأمامية لتحديد انتهاء التجربة.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredTrials = await db.platformSubscription.findMany({
    where: { status: "TRIAL", trialEnd: { lt: new Date() } },
  });

  for (const sub of expiredTrials) {
    await db.platformSubscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    await notifyWorkspace({
      workspaceId: sub.workspaceId,
      type: "SUBSCRIPTION",
      title: "انتهت الفترة التجريبية",
      body: "انتهت الفترة التجريبية لاشتراكك في أمبير. يرجى ترقية الباقة لمتابعة استخدام الميزات المدفوعة.",
    });
  }

  return NextResponse.json({ expired: expiredTrials.length });
}
