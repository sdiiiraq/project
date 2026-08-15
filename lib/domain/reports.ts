import "server-only";
import { db } from "@/lib/db";
import type { ReportType, ReportRow } from "./report-types";

export type { ReportType, ReportRow } from "./report-types";

export async function getReportData(
  workspaceId: string,
  type: ReportType,
  range: { from: Date; to: Date },
): Promise<{ columns: { key: string; label: string }[]; rows: ReportRow[] }> {
  switch (type) {
    case "collection": {
      const payments = await db.payment.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        include: { customer: true },
        orderBy: { date: "desc" },
      });
      return {
        columns: [
          { key: "date", label: "التاريخ" },
          { key: "customer", label: "المشترك" },
          { key: "amount", label: "المبلغ" },
          { key: "method", label: "طريقة الدفع" },
        ],
        rows: payments.map((p) => ({
          date: p.date.toISOString().slice(0, 10),
          customer: p.customer.name,
          amount: Number(p.amount),
          method: p.method,
        })),
      };
    }
    case "outstanding": {
      const invoices = await db.invoice.findMany({
        where: { workspaceId, status: { not: "PAID" } },
        include: { customer: true },
        orderBy: { periodStart: "asc" },
      });
      return {
        columns: [
          { key: "customer", label: "المشترك" },
          { key: "period", label: "الفترة" },
          { key: "amount", label: "المبلغ" },
          { key: "paid", label: "المدفوع" },
          { key: "outstanding", label: "المتبقي" },
        ],
        rows: invoices.map((i) => ({
          customer: i.customer.name,
          period: i.periodStart.toISOString().slice(0, 10),
          amount: Number(i.amount),
          paid: Number(i.paidAmount),
          outstanding: Number(i.amount) - Number(i.paidAmount),
        })),
      };
    }
    case "expense": {
      const expenses = await db.expense.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        include: { category: true },
        orderBy: { date: "desc" },
      });
      return {
        columns: [
          { key: "date", label: "التاريخ" },
          { key: "category", label: "التصنيف" },
          { key: "vendor", label: "على ماذا صرفت" },
          { key: "amount", label: "المبلغ" },
        ],
        rows: expenses.map((e) => ({
          date: e.date.toISOString().slice(0, 10),
          category: e.category.name,
          vendor: e.vendor ?? "—",
          amount: Number(e.amount),
        })),
      };
    }
    case "fuel": {
      const purchases = await db.fuelPurchase.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        orderBy: { date: "desc" },
      });
      return {
        columns: [
          { key: "date", label: "التاريخ" },
          { key: "quantity", label: "الكمية (لتر)" },
          { key: "pricePerLiter", label: "سعر اللتر" },
          { key: "totalCost", label: "الكلفة الكلية" },
          { key: "supplier", label: "المورد" },
        ],
        rows: purchases.map((p) => ({
          date: p.date.toISOString().slice(0, 10),
          quantity: Number(p.quantityLiters),
          pricePerLiter: Number(p.pricePerLiter),
          totalCost: Number(p.totalCost),
          supplier: p.supplier ?? "—",
        })),
      };
    }
    case "maintenance": {
      const records = await db.maintenanceRecord.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        include: { equipment: true },
        orderBy: { date: "desc" },
      });
      return {
        columns: [
          { key: "date", label: "التاريخ" },
          { key: "equipment", label: "المعدة" },
          { key: "type", label: "النوع" },
          { key: "technician", label: "الفني" },
          { key: "cost", label: "التكلفة" },
        ],
        rows: records.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          equipment: r.equipment.name,
          type: r.type,
          technician: r.technician ?? "—",
          cost: Number(r.cost),
        })),
      };
    }
    case "profit": {
      const [payments, expenses] = await Promise.all([
        db.payment.findMany({ where: { workspaceId, date: { gte: range.from, lte: range.to } } }),
        db.expense.findMany({ where: { workspaceId, date: { gte: range.from, lte: range.to } } }),
      ]);
      const revenue = payments.reduce((s, p) => s + Number(p.amount), 0);
      const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      return {
        columns: [
          { key: "label", label: "البند" },
          { key: "amount", label: "المبلغ" },
        ],
        rows: [
          { label: "إجمالي الدافع", amount: revenue },
          { label: "إجمالي المصروفات", amount: totalExpenses },
          { label: "صافي الربح", amount: revenue - totalExpenses },
        ],
      };
    }
    case "collector": {
      const settlements = await db.collectorSettlement.findMany({
        where: { workspaceId, periodStart: { gte: range.from }, periodEnd: { lte: range.to } },
        orderBy: { createdAt: "desc" },
      });
      const collectorIds = [...new Set(settlements.map((s) => s.collectorUserId))];
      const users = await db.user.findMany({ where: { id: { in: collectorIds } } });
      const userMap = new Map(users.map((u) => [u.id, u.fullName]));
      return {
        columns: [
          { key: "collector", label: "الجابي" },
          { key: "expected", label: "المتوقع" },
          { key: "actual", label: "الفعلي" },
          { key: "difference", label: "الفرق" },
          { key: "status", label: "الحالة" },
        ],
        rows: settlements.map((s) => ({
          collector: userMap.get(s.collectorUserId) ?? "—",
          expected: Number(s.expectedAmount),
          actual: Number(s.actualAmount),
          difference: Number(s.difference),
          status: s.status,
        })),
      };
    }
    case "customer": {
      const customers = await db.customer.findMany({
        where: { workspaceId, deletedAt: null, createdAt: { lte: range.to } },
        include: { subscriptions: { where: { status: "ACTIVE" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      });
      return {
        columns: [
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "amperes", label: "الأمبير" },
          { key: "status", label: "الحالة" },
        ],
        rows: customers.map((c) => ({
          name: c.name,
          phone: c.phone ?? "—",
          amperes: c.subscriptions[0]?.amperes ?? 0,
          status: c.status,
        })),
      };
    }
  }
}
