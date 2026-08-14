import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateMonthlyInvoices } from "@/lib/domain/billing";

// Vercel Cron — يعمل أول كل شهر وينشئ فواتير الاشتراكات النشطة لكل Workspace.
// Idempotent: Unique Constraint على (customerId, periodStart, periodEnd) يمنع التكرار عند إعادة التشغيل.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const workspaces = await db.workspace.findMany({ where: { status: "ACTIVE" }, select: { id: true } });

  const results = [];
  for (const workspace of workspaces) {
    const result = await generateMonthlyInvoices(workspace.id, year, month);
    results.push({ workspaceId: workspace.id, ...result });
  }

  return NextResponse.json({ year, month, workspaces: results.length, results });
}
