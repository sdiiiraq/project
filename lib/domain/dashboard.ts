import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";

const MONTH_LABELS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function lastNMonths(n: number, from = new Date()) {
  const months: { year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

export async function getDashboardStats(workspaceId: string) {
  const now = new Date();
  const { periodStart: monthStart, periodEnd: monthEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);

  const [
    customerCount,
    activeCustomerCount,
    activeSubscriptions,
    monthInvoices,
    monthExpenses,
    monthFuel,
    allOpenInvoices,
    overdueCustomers,
    overdueCount,
    expiredSubscriptionsCount,
  ] = await Promise.all([
    db.customer.count({ where: { workspaceId, deletedAt: null } }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "ACTIVE" } }),
    db.customerSubscription.findMany({
      where: { status: "ACTIVE", customer: { workspaceId, deletedAt: null } },
      select: { amperes: true },
    }),
    db.invoice.findMany({ where: { workspaceId, periodStart: { gte: monthStart, lte: monthEnd } } }),
    db.expense.aggregate({ where: { workspaceId, date: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } }),
    db.fuelPurchase.aggregate({ where: { workspaceId, date: { gte: monthStart, lte: monthEnd } }, _sum: { totalCost: true } }),
    db.invoice.aggregate({ where: { workspaceId, status: { not: "PAID" } }, _sum: { amount: true, paidAmount: true } }),
    db.customer.findMany({
      where: { workspaceId, deletedAt: null, status: "OVERDUE" },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "OVERDUE" } }),
    db.customerSubscription.count({ where: { status: "EXPIRED", customer: { workspaceId, deletedAt: null } } }),
  ]);

  const totalAmperes = activeSubscriptions.reduce((sum, s) => sum + s.amperes, 0);
  const monthDue = monthInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const monthCollected = monthInvoices.reduce((sum, i) => sum + Number(i.paidAmount), 0);
  const monthExpensesTotal = Number(monthExpenses._sum.amount ?? 0);
  const monthFuelTotal = Number(monthFuel._sum.totalCost ?? 0);
  const netProfit = monthCollected - monthExpensesTotal;
  const totalOutstanding = Number(allOpenInvoices._sum.amount ?? 0) - Number(allOpenInvoices._sum.paidAmount ?? 0);

  const months = lastNMonths(6, now);
  const monthlyStats = await Promise.all(
    months.map(async ({ year, month }) => {
      const { periodStart, periodEnd } = monthRange(year, month);
      const [invoices, customersUntilMonth] = await Promise.all([
        db.invoice.findMany({ where: { workspaceId, periodStart: { gte: periodStart, lte: periodEnd } } }),
        db.customer.count({ where: { workspaceId, deletedAt: null, createdAt: { lte: periodEnd } } }),
      ]);
      const label = MONTH_LABELS[month - 1] ?? String(month);
      return {
        label,
        due: invoices.reduce((sum, i) => sum + Number(i.amount), 0),
        collected: invoices.reduce((sum, i) => sum + Number(i.paidAmount), 0),
        customersUntilMonth,
      };
    }),
  );

  const revenueTrend = monthlyStats.map((s) => ({ month: s.label, المطلوب: s.due, المحصّل: s.collected }));
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
