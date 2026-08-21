import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";
import { monthKey, monthlySums, monthlyDisconnections } from "./monthly-aggregates";
import { formatMonthLabel } from "@/lib/utils/date";

function lastNMonths(n: number, from = new Date()) {
  const months: { year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

function windowFor(months: { year: number; month: number }[]) {
  const first = months[0]!;
  const last = months[months.length - 1]!;
  return {
    windowStart: monthRange(first.year, first.month).periodStart,
    windowEnd: monthRange(last.year, last.month).periodEnd,
  };
}

// كل الدوال هنا كانت تجلب ستة أشهر من الصفوف الكاملة إلى الذاكرة ثم تُصفّيها وتجمعها
// بـ filter/reduce لكل شهر. الآن التجميع يحدث في PostgreSQL ولا يصل إلى Node سوى صف
// واحد لكل شهر (أو لكل تصنيف).
export async function getAnalyticsData(workspaceId: string) {
  const now = new Date();
  const months = lastNMonths(6, now);
  const { windowStart, windowEnd } = windowFor(months);

  const [expensesByCategory, invoicesByPeriod, fuelByMonth] = await Promise.all([
    db.expense.groupBy({
      by: ["categoryId"],
      where: { workspaceId, date: { gte: windowStart, lte: windowEnd } },
      _sum: { amount: true },
    }),
    db.invoice.groupBy({
      by: ["periodStart"],
      where: { workspaceId, periodStart: { gte: windowStart, lte: windowEnd } },
      _sum: { amount: true, paidAmount: true },
    }),
    monthlySums("fuelPurchases", workspaceId, windowStart, windowEnd),
  ]);

  // أسماء التصنيفات المستخدمة فعلًا فقط — لا join على كل صفوف المصاريف.
  const categories = await db.expenseCategory.findMany({
    where: { id: { in: expensesByCategory.map((row) => row.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const expenseBreakdown = expensesByCategory.map((row) => ({
    name: categoryNames.get(row.categoryId) ?? "غير مصنّف",
    value: Number(row._sum.amount ?? 0),
  }));

  const invoiceTotals = new Map(
    invoicesByPeriod.map((row) => [
      monthKey(row.periodStart),
      { due: Number(row._sum.amount ?? 0), collected: Number(row._sum.paidAmount ?? 0) },
    ]),
  );

  const collectionRateTrend = months.map(({ year, month }) => {
    const key = monthKey(new Date(Date.UTC(year, month - 1, 1)));
    const { due, collected } = invoiceTotals.get(key) ?? { due: 0, collected: 0 };
    return {
      month: formatMonthLabel(month),
      "نسبة التحصيل": due > 0 ? Math.round((collected / due) * 100) : 0,
    };
  });

  const fuelCostTrend = months.map(({ year, month }) => ({
    month: formatMonthLabel(month),
    "كلفة الوقود": fuelByMonth.get(monthKey(new Date(Date.UTC(year, month - 1, 1)))) ?? 0,
  }));

  return { expenseBreakdown, collectionRateTrend, fuelCostTrend };
}

// تحليلات متقدمة (FEATURE_ADVANCED_ANALYTICS): هامش الربح واستبقاء المشتركين على مدى 6 أشهر
export async function getAdvancedAnalyticsData(workspaceId: string) {
  const now = new Date();
  const months = lastNMonths(6, now);
  const { windowStart, windowEnd } = windowFor(months);

  const [invoicesByPeriod, expensesByMonth, fuelByMonth, maintenanceByMonth, disconnectionsByMonth] = await Promise.all([
    db.invoice.groupBy({
      by: ["periodStart"],
      where: { workspaceId, periodStart: { gte: windowStart, lte: windowEnd } },
      _sum: { paidAmount: true },
    }),
    monthlySums("expenses", workspaceId, windowStart, windowEnd),
    monthlySums("fuelPurchases", workspaceId, windowStart, windowEnd),
    monthlySums("maintenance", workspaceId, windowStart, windowEnd),
    monthlyDisconnections(workspaceId, windowStart, windowEnd),
  ]);

  const collectedByMonth = new Map(
    invoicesByPeriod.map((row) => [monthKey(row.periodStart), Number(row._sum.paidAmount ?? 0)]),
  );

  // هامش الربح = (الدافع - كل التكاليف الفعلية التي أدخلها المستخدم: مصاريف + وقود + صيانة) / الدافع
  // — يطابق نفس منطق صافي الربح في لوحة التحكم، بلا أي رسوم أو تكاليف مضافة من النظام.
  const profitMarginTrend = months.map(({ year, month }) => {
    const key = monthKey(new Date(Date.UTC(year, month - 1, 1)));
    const collected = collectedByMonth.get(key) ?? 0;
    const costsTotal =
      (expensesByMonth.get(key) ?? 0) + (fuelByMonth.get(key) ?? 0) + (maintenanceByMonth.get(key) ?? 0);
    const margin = collected > 0 ? Math.round(((collected - costsTotal) / collected) * 100) : 0;
    return { month: formatMonthLabel(month), "هامش الربح": margin };
  });

  const retentionTrend = months.map(({ year, month }) => ({
    month: formatMonthLabel(month),
    "مشتركون مقطوعون": disconnectionsByMonth.get(monthKey(new Date(Date.UTC(year, month - 1, 1)))) ?? 0,
  }));

  return { profitMarginTrend, retentionTrend };
}
