import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";
import { monthKey, monthlyNewCustomers } from "./monthly-aggregates";
import { formatMonthLabel } from "@/lib/utils/date";

function lastNMonths(n: number, from = new Date()) {
  const months: { year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

// كل الأرقام تُحسب في PostgreSQL. سابقًا كانت الفواتير والاشتراكات تُجلب كصفوف كاملة
// ثم تُجمع بـ reduce في Node — سبعة استعلامات findMany غير مُجمَّعة لكل تحميل صفحة،
// إضافة إلى استعلامين لكل شهر من الأشهر الستة (23 استعلامًا إجمالًا).
export async function getDashboardStats(workspaceId: string) {
  const now = new Date();
  const { periodStart: monthStart, periodEnd: monthEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);

  const months = lastNMonths(6, now);
  const windowStart = monthRange(months[0]!.year, months[0]!.month).periodStart;
  const windowEnd = monthRange(months[months.length - 1]!.year, months[months.length - 1]!.month).periodEnd;

  const [
    customerCount,
    activeCustomerCount,
    amperesAgg,
    monthInvoiceAgg,
    monthExpenses,
    monthFuel,
    monthMaintenance,
    allOpenInvoices,
    overdueCustomers,
    overdueCount,
    expiredSubscriptionsCount,
    invoicesByPeriod,
    customersBeforeWindow,
    newCustomersByMonth,
  ] = await Promise.all([
    db.customer.count({ where: { workspaceId, deletedAt: null } }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "ACTIVE" } }),
    db.customerSubscription.aggregate({
      where: { status: "ACTIVE", customer: { workspaceId, deletedAt: null } },
      _sum: { amperes: true },
    }),
    db.invoice.aggregate({
      where: { workspaceId, periodStart: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true, paidAmount: true },
    }),
    db.expense.aggregate({ where: { workspaceId, date: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } }),
    db.fuelPurchase.aggregate({ where: { workspaceId, date: { gte: monthStart, lte: monthEnd } }, _sum: { totalCost: true } }),
    db.maintenanceRecord.aggregate({ where: { workspaceId, date: { gte: monthStart, lte: monthEnd } }, _sum: { cost: true } }),
    db.invoice.aggregate({ where: { workspaceId, status: { not: "PAID" } }, _sum: { amount: true, paidAmount: true } }),
    db.customer.findMany({
      where: { workspaceId, deletedAt: null, status: "OVERDUE" },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "OVERDUE" } }),
    db.customerSubscription.count({ where: { status: "EXPIRED", customer: { workspaceId, deletedAt: null } } }),
    // كل فواتير الشهر الواحد تحمل نفس periodStart، فالتجميع عليه يعطي سلسلة الأشهر مباشرة.
    db.invoice.groupBy({
      by: ["periodStart"],
      where: { workspaceId, periodStart: { gte: windowStart, lte: windowEnd } },
      _sum: { amount: true, paidAmount: true },
    }),
    // أساس المنحنى التراكمي: من أُنشئ قبل بداية النافذة.
    db.customer.count({ where: { workspaceId, deletedAt: null, createdAt: { lt: windowStart } } }),
    monthlyNewCustomers(workspaceId, windowStart, windowEnd),
  ]);

  const totalAmperes = Number(amperesAgg._sum.amperes ?? 0);
  const monthDue = Number(monthInvoiceAgg._sum.amount ?? 0);
  const monthCollected = Number(monthInvoiceAgg._sum.paidAmount ?? 0);
  const monthExpensesTotal = Number(monthExpenses._sum.amount ?? 0);
  const monthFuelTotal = Number(monthFuel._sum.totalCost ?? 0);
  const monthMaintenanceTotal = Number(monthMaintenance._sum.cost ?? 0);
  const netProfit = monthCollected - monthExpensesTotal - monthFuelTotal - monthMaintenanceTotal;
  const totalOutstanding = Number(allOpenInvoices._sum.amount ?? 0) - Number(allOpenInvoices._sum.paidAmount ?? 0);

  const invoiceTotals = new Map(
    invoicesByPeriod.map((row) => [
      monthKey(row.periodStart),
      { due: Number(row._sum.amount ?? 0), collected: Number(row._sum.paidAmount ?? 0) },
    ]),
  );

  let cumulativeCustomers = customersBeforeWindow;
  const monthlyStats = months.map(({ year, month }) => {
    const key = monthKey(new Date(Date.UTC(year, month - 1, 1)));
    const totals = invoiceTotals.get(key) ?? { due: 0, collected: 0 };
    cumulativeCustomers += newCustomersByMonth.get(key) ?? 0;
    return {
      label: formatMonthLabel(month),
      due: totals.due,
      collected: totals.collected,
      customersUntilMonth: cumulativeCustomers,
    };
  });

  const revenueTrend = monthlyStats.map((s) => ({ month: s.label, المطلوب: s.due, الدافع: s.collected }));
  const growthTrend = monthlyStats.map((s) => ({ month: s.label, مشتركون: s.customersUntilMonth }));

  return {
    customerCount,
    activeCustomerCount,
    totalAmperes,
    monthDue,
    monthCollected,
    monthExpensesTotal,
    monthFuelTotal,
    netProfit,
    totalOutstanding,
    overdueCustomers,
    overdueCount,
    expiredSubscriptionsCount,
    revenueTrend,
    growthTrend,
  };
}
