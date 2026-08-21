import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./billing";

async function getMonthSnapshot(workspaceId: string, year: number, month: number) {
  const { periodStart, periodEnd } = monthRange(year, month);

  const [invoiceAgg, expenses, fuelPurchases, customerCount] = await Promise.all([
    // كان findMany ثم reduce — الآن التجميع في قاعدة البيانات ولا تُقرأ أي صفوف.
    db.invoice.aggregate({
      where: { workspaceId, periodStart: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true, paidAmount: true },
    }),
    db.expense.aggregate({ where: { workspaceId, date: { gte: periodStart, lte: periodEnd } }, _sum: { amount: true } }),
    db.fuelPurchase.aggregate({ where: { workspaceId, date: { gte: periodStart, lte: periodEnd } }, _sum: { totalCost: true, quantityLiters: true } }),
    db.customer.count({ where: { workspaceId, deletedAt: null, createdAt: { lte: periodEnd } } }),
  ]);

  const due = Number(invoiceAgg._sum.amount ?? 0);
  const collected = Number(invoiceAgg._sum.paidAmount ?? 0);
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
      select: { id: true, name: true },
    }),
    db.customer.count({ where: { workspaceId, deletedAt: null, status: "OVERDUE" } }),
    db.fuelPurchase.aggregate({ where: { workspaceId }, _sum: { quantityLiters: true } }),
  ]);

  const fuelUsedAgg = await db.fuelUsage.aggregate({ where: { workspaceId }, _sum: { quantityLiters: true } });
  const currentStockLiters = Number(fuelStock._sum.quantityLiters ?? 0) - Number(fuelUsedAgg._sum.quantityLiters ?? 0);

  // المستحق لكل مشترك يُجمَّع في قاعدة البيانات بدل جلب كل فواتيره غير المدفوعة.
  const outstandingByCustomer = await db.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: overdueCustomers.map((c) => c.id) }, status: { not: "PAID" } },
    _sum: { amount: true, paidAmount: true },
  });
  const outstandingMap = new Map(
    outstandingByCustomer.map((row) => [
      row.customerId,
      Number(row._sum.amount ?? 0) - Number(row._sum.paidAmount ?? 0),
    ]),
  );

  const topOverdueCustomers = overdueCustomers
    .map((c) => ({ name: c.name, outstandingIQD: outstandingMap.get(c.id) ?? 0 }))
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
