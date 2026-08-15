import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifyWorkspace } from "@/lib/domain/notifications";

// Vercel Cron يومي — يبني تنبيهات من بيانات حقيقية فقط: مشتركون متأخرون، مواعيد صيانة مستحقة، مخزون وقود منخفض.
const OVERDUE_CHECKPOINTS = new Set([1, 3, 5, 7, 14, 30]);
const LOW_FUEL_THRESHOLD_LITERS = 50;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const workspaces = await db.workspace.findMany({ where: { status: "ACTIVE" }, select: { id: true } });

  let overdueNotified = 0;
  let maintenanceNotified = 0;
  let lowFuelNotified = 0;

  for (const workspace of workspaces) {
    // مشتركون متأخرون — نُنبّه فقط عند نقاط تحقق محددة (1/3/5/7/14/30 يوم) لتفادي إغراق الإشعارات.
    const overdueInvoices = await db.invoice.findMany({
      where: { workspaceId: workspace.id, status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true },
      orderBy: { periodEnd: "asc" },
    });
    const seenCustomer = new Set<string>();
    for (const invoice of overdueInvoices) {
      if (seenCustomer.has(invoice.customerId) || invoice.customer.deletedAt) continue;
      seenCustomer.add(invoice.customerId);
      const daysOverdue = daysBetween(invoice.periodEnd, now);
      if (daysOverdue > 0 && OVERDUE_CHECKPOINTS.has(daysOverdue)) {
        await notifyWorkspace({
          workspaceId: workspace.id,
          type: "DEBT",
          title: "مشترك متأخر عن الدفع",
          body: `المشترك ${invoice.customer.name} تأخر ${daysOverdue} ${daysOverdue === 1 ? "يوم" : "أيام"} عن تسديد اشتراكه.`,
        });
        overdueNotified++;
      }
    }

    // مواعيد صيانة مستحقة اليوم بالضبط (حسب nextMaintenanceDate الفعلي المسجّل).
    const dueMaintenance = await db.maintenanceRecord.findMany({
      where: {
        workspaceId: workspace.id,
        nextMaintenanceDate: {
          gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
        },
      },
      include: { equipment: true },
    });
    for (const record of dueMaintenance) {
      await notifyWorkspace({
        workspaceId: workspace.id,
        type: "MAINTENANCE",
        title: "موعد صيانة اليوم",
        body: `موعد صيانة "${record.type}" لـ ${record.equipment.name} اليوم.`,
      });
      maintenanceNotified++;
    }

    // مخزون الوقود المنخفض — من بيانات المشتريات/الاستهلاك الفعلية.
    const [purchaseAgg, usageAgg] = await Promise.all([
      db.fuelPurchase.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true } }),
      db.fuelUsage.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true } }),
    ]);
    const currentStock = Number(purchaseAgg._sum.quantityLiters ?? 0) - Number(usageAgg._sum.quantityLiters ?? 0);
    if (currentStock < LOW_FUEL_THRESHOLD_LITERS) {
      await notifyWorkspace({
        workspaceId: workspace.id,
        type: "SYSTEM",
        title: "مخزون الوقود منخفض",
        body: `المخزون الحالي ${currentStock.toLocaleString("ar-IQ")} لتر فقط — يُفضّل شراء وقود قريبًا.`,
      });
      lowFuelNotified++;
    }
  }

  return NextResponse.json({ workspaces: workspaces.length, overdueNotified, maintenanceNotified, lowFuelNotified });
}
