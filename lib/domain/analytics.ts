import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";
import { formatMonthLabel } from "@/lib/utils/date";

function lastNMonths(n: number, from = new Date()) {
  const months: { year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

export async function getAnalyticsData(workspaceId: string) {
  const now = new Date();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [expenses, invoices, fuelPurchases] = await Promise.all([
    db.expense.findMany({
      where: { workspaceId, date: { gte: sixMonthsAgo } },
      include: { category: true },
    }),
    db.invoice.findMany({ where: { workspaceId, periodStart: { gte: sixMonthsAgo } } }),
    db.fuelPurchase.findMany({ where: { workspaceId, date: { gte: sixMonthsAgo } } }),
  ]);

  const expenseByCategory = new Map<string, number>();
  for (const e of expenses) {
    expenseByCategory.set(e.category.name, (expenseByCategory.get(e.category.name) ?? 0) + Number(e.amount));
  }
  const expenseBreakdown = Array.from(expenseByCategory.entries()).map(([name, value]) => ({ name, value }));

  const months = lastNMonths(6, now);
  const collectionRateTrend = months.map(({ year, month }) => {
    const { periodStart, periodEnd } = monthRange(year, month);
    const monthInvoices = invoices.filter((i) => i.periodStart >= periodStart && i.periodStart <= periodEnd);
    const due = monthInvoices.reduce((s, i) => s + Number(i.amount), 0);
    const collected = monthInvoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    return {
      month: formatMonthLabel(month),
      "نسبة التحصيل": due > 0 ? Math.round((collected / due) * 100) : 0,
    };
  });

  const fuelCostTrend = months.map(({ year, month }) => {
    const { periodStart, periodEnd } = monthRange(year, month);
    const monthPurchases = fuelPurchases.filter((p) => p.date >= periodStart && p.date <= periodEnd);
    return {
      month: formatMonthLabel(month),
      "كلفة الوقود": monthPurchases.reduce((s, p) => s + Number(p.totalCost), 0),
    };
  });

  return { expenseBreakdown, collectionRateTrend, fuelCostTrend };
}

// تحليلات متقدمة (FEATURE_ADVANCED_ANALYTICS): هامش الربح واستبقاء المشتركين على مدى 6 أشهر
export async function getAdvancedAnalyticsData(workspaceId: string) {
  const now = new Date();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [invoices, expenses, fuelPurchases, maintenanceRecords, disconnectedLogs] = await Promise.all([
    db.invoice.findMany({ where: { workspaceId, periodStart: { gte: sixMonthsAgo } } }),
    db.expense.findMany({ where: { workspaceId, date: { gte: sixMonthsAgo } } }),
    db.fuelPurchase.findMany({ where: { workspaceId, date: { gte: sixMonthsAgo } } }),
    db.maintenanceRecord.findMany({ where: { workspaceId, date: { gte: sixMonthsAgo } } }),
    db.auditLog.findMany({
      where: { workspaceId, action: "customer.status_change", createdAt: { gte: sixMonthsAgo } },
    }),
  ]);

  const months = lastNMonths(6, now);

  // هامش الربح = (الدافع - كل التكاليف الفعلية التي أدخلها المستخدم: مصاريف + وقود + صيانة) / الدافع
  // — يطابق نفس منطق صافي الربح في لوحة التحكم، بلا أي رسوم أو تكاليف مضافة من النظام.
  const profitMarginTrend = months.map(({ year, month }) => {
    const { periodStart, periodEnd } = monthRange(year, month);
    const monthInvoices = invoices.filter((i) => i.periodStart >= periodStart && i.periodStart <= periodEnd);
    const monthExpenses = expenses.filter((e) => e.date >= periodStart && e.date <= periodEnd);
    const monthFuel = fuelPurchases.filter((p) => p.date >= periodStart && p.date <= periodEnd);
    const monthMaintenance = maintenanceRecords.filter((r) => r.date >= periodStart && r.date <= periodEnd);
    const collected = monthInvoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const costsTotal =
      monthExpenses.reduce((s, e) => s + Number(e.amount), 0) +
      monthFuel.reduce((s, p) => s + Number(p.totalCost), 0) +
      monthMaintenance.reduce((s, r) => s + Number(r.cost), 0);
    const margin = collected > 0 ? Math.round(((collected - costsTotal) / collected) * 100) : 0;
    return { month: formatMonthLabel(month), "هامش الربح": margin };
  });

  const retentionTrend = months.map(({ year, month }) => {
    const { periodStart, periodEnd } = monthRange(year, month);
    const disconnected = disconnectedLogs.filter((log) => {
      if (log.createdAt < periodStart || log.createdAt > periodEnd) return false;
      const after = log.after as { status?: string } | null;
      return after?.status === "DISCONNECTED";
    }).length;
    return { month: formatMonthLabel(month), "مشتركون مقطوعون": disconnected };
  });

  return { profitMarginTrend, retentionTrend };
}
