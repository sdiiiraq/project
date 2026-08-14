import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";

async function getMonthSnapshot(workspaceId: string, year: number, month: number) {
  const { periodStart, periodEnd } = monthRange(year, month);

  const [invoices, expenses, fuelPurchases, customerCount] = await Promise.all([
    db.invoice.findMany({ where: { workspaceId, periodStart: { gte: periodStart, lte: periodEnd } } }),
    db.expense.aggregate({ where: { workspaceId, date: { gte: periodStart, lte: periodEnd } }, _sum: { amount: true } }),
    db.fuelPurchase.aggregate({ where: { workspaceId, date: { gte: periodStart, lte: periodEnd } }, _sum: { totalCost: true, quantityLiters: true } }),
    db.customer.count({ where: { workspaceId, deletedAt: null, createdAt: { lte: periodEnd } } }),
  ]);

  const due = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const collected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  const expensesTotal = Number(expenses._sum.amount ?? 0);

  return {
    due,
    collected,
    outstanding: due - collected,
    expenses: expensesTotal,
    netProfit: collected - expensesTotal,
    fuelCostIQD: Number(fuelPurchases._sum.totalCost ?? 0),
    fuelPurchasedLiters: Number(fuelPurchases._sum.quantityLiters ?? 0),
    customerCount,
  };
}

// يُبنى هذا السياق من بيانات محسوبة من قاعدة البيانات فقط — المساعد الذكي لا يصل إلى قاعدة
// البيانات مباشرة ولا يتجاوز نطاق هذا الـ Workspace بأي شكل.
export async function getAIContext(workspaceId: string) {
  const now = new Date();
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [generator, currentMonth, previousMonth, overdueCustomers, overdueCount, fuelStock] = await Promise.all([
    db.generator.findFirst({ where: { workspaceId } }),
    getMonthSnapshot(workspaceId, now.getUTCFullYear(), now.getUTCMonth() + 1),
    getMonthSnapshot(workspaceId, prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth() + 1),
    db.customer.findMany({
      where: { workspaceId, deletedAt: null, status: "OVERDUE" },
      take: 10,
      include: { invoices: { where: { status: { not: "PAID" } } } },
    }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "OVERDUE" } }),
    db.fuelPurchase.aggregate({ where: { workspaceId }, _sum: { quantityLiters: true } }),
  ]);

  const fuelUsedAgg = await db.fuelUsage.aggregate({ where: { workspaceId }, _sum: { quantityLiters: true } });
  const currentStockLiters = Number(fuelStock._sum.quantityLiters ?? 0) - Number(fuelUsedAgg._sum.quantityLiters ?? 0);

  const topOverdueCustomers = overdueCustomers
    .map((c) => ({
      name: c.name,
      outstandingIQD: c.invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paidAmount), 0),
    }))
    .sort((a, b) => b.outstandingIQD - a.outstandingIQD)
    .slice(0, 5);

  return {
    generatorName: generator?.name ?? "المولدة",
    currentMonth,
    previousMonth,
    overdueCustomersCount: overdueCount,
    topOverdueCustomers,
    fuelCurrentStockLiters: currentStockLiters,
  };
}

export type AIContext = Awaited<ReturnType<typeof getAIContext>>;
