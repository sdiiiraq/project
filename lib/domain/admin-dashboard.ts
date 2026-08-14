import "server-only";
import { db } from "@/lib/db";

const MONTH_LABELS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function lastNMonths(n: number, from = new Date()) {
  const months: { year: number; month: number; start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i + 1, 0, 23, 59, 59, 999));
    months.push({ year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, start, end });
  }
  return months;
}

export async function getAdminDashboardStats() {
  const [
    totalWorkspaces,
    activeWorkspaces,
    suspendedWorkspaces,
    trialSubscriptions,
    activeSubscriptions,
    expiredSubscriptions,
    activeMonthlySubs,
    totalRevenue,
  ] = await Promise.all([
    db.workspace.count(),
    db.workspace.count({ where: { status: "ACTIVE" } }),
    db.workspace.count({ where: { status: "SUSPENDED" } }),
    db.platformSubscription.count({ where: { status: "TRIAL" } }),
    db.platformSubscription.count({ where: { status: "ACTIVE" } }),
    db.platformSubscription.count({ where: { status: "EXPIRED" } }),
    db.platformSubscription.findMany({ where: { status: "ACTIVE", plan: { billingCycle: "MONTHLY" } }, select: { price: true } }),
    db.billingTransaction.aggregate({ where: { type: "CHARGE" }, _sum: { amount: true } }),
  ]);

  const mrr = activeMonthlySubs.reduce((sum, s) => sum + Number(s.price), 0);
  const arr = mrr * 12;

  const months = lastNMonths(6);
  const workspaceGrowth = await Promise.all(
    months.map(async ({ month, end }) => ({
      month: MONTH_LABELS[month - 1] ?? String(month),
      "عدد المولدات": await db.workspace.count({ where: { createdAt: { lte: end } } }),
    })),
  );

  return {
    totalWorkspaces,
    activeWorkspaces,
    suspendedWorkspaces,
    trialSubscriptions,
    activeSubscriptions,
    expiredSubscriptions,
    mrr,
    arr,
    totalRevenue: Number(totalRevenue._sum.amount ?? 0),
    workspaceGrowth,
  };
}
