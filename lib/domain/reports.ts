import "server-only";
import { db } from "@/lib/db";
import type { ReportType, ReportRow } from "./report-types";

export type { ReportType, ReportRow } from "./report-types";

// ============================================================
// التقارير — محدودة دائمًا.
//
// كانت كل الدوال تُنفّذ findMany بلا take: تقرير على مدى واسع لمولدة كبيرة كان يُحمّل
// كل الصفوف + join إلى الذاكرة ثم يُسلسلها إلى العميل دفعة واحدة.
//
// الآن مساران منفصلان يتقاسمان نفس تعريف الأعمدة والصفوف:
//   • واجهة المستخدم  ⇒ getReportPage    (صفحة واحدة، take/skip)
//   • التصدير        ⇒ streamReportRows (دفعات متتابعة بـ cursor، ذاكرة ثابتة)
// ============================================================

export const REPORT_DEFAULT_PAGE_SIZE = 50;
export const REPORT_MAX_PAGE_SIZE = 200;
/** أقصى مدى تاريخي مسموح لتقرير واحد — يمنع طلب "كل التاريخ" بضربة واحدة. */
export const REPORT_MAX_RANGE_DAYS = 366;
const EXPORT_BATCH_SIZE = 1_000;
/** سقف صلب لعدد صفوف التصدير — يمنع تصديرًا لا ينتهي. */
export const REPORT_MAX_EXPORT_ROWS = 100_000;

const DAY_MS = 1000 * 60 * 60 * 24;

export type ReportRange = { from: Date; to: Date };

export type ReportPage = {
  columns: { key: string; label: string }[];
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  /** التقارير التجميعية (الأرباح) تُعيد ملخصًا ثابتًا ولا تُصفَّح. */
  paginated: boolean;
  /** صار المدى أضيق مما طُلب لأنه تجاوز الحد المسموح. */
  rangeClamped: boolean;
};

const COLUMNS: Record<ReportType, { key: string; label: string }[]> = {
  collection: [
    { key: "date", label: "التاريخ" },
    { key: "customer", label: "المشترك" },
    { key: "amount", label: "المبلغ" },
    { key: "method", label: "طريقة الدفع" },
  ],
  outstanding: [
    { key: "customer", label: "المشترك" },
    { key: "period", label: "الفترة" },
    { key: "amount", label: "المبلغ" },
    { key: "paid", label: "المدفوع" },
    { key: "outstanding", label: "المتبقي" },
  ],
  expense: [
    { key: "date", label: "التاريخ" },
    { key: "category", label: "التصنيف" },
    { key: "vendor", label: "على ماذا صرفت" },
    { key: "amount", label: "المبلغ" },
  ],
  fuel: [
    { key: "date", label: "التاريخ" },
    { key: "quantity", label: "الكمية (لتر)" },
    { key: "pricePerLiter", label: "سعر اللتر" },
    { key: "totalCost", label: "الكلفة الكلية" },
    { key: "supplier", label: "المورد" },
  ],
  maintenance: [
    { key: "date", label: "التاريخ" },
    { key: "equipment", label: "المعدة" },
    { key: "type", label: "النوع" },
    { key: "technician", label: "الفني" },
    { key: "cost", label: "التكلفة" },
  ],
  profit: [
    { key: "label", label: "البند" },
    { key: "amount", label: "المبلغ" },
  ],
  customer: [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "amperes", label: "الأمبير" },
    { key: "status", label: "الحالة" },
  ],
};

export function reportColumns(type: ReportType) {
  return COLUMNS[type];
}

export function clampPageSize(requested?: number): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) return REPORT_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(requested), REPORT_MAX_PAGE_SIZE);
}

/** يقصّ المدى التاريخي إلى الحد الأقصى المسموح، مع إبقاء تاريخ النهاية كما طُلب. */
export function clampRange(range: ReportRange): { range: ReportRange; clamped: boolean } {
  const spanDays = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (spanDays <= REPORT_MAX_RANGE_DAYS) return { range, clamped: false };
  return {
    range: { from: new Date(range.to.getTime() - REPORT_MAX_RANGE_DAYS * DAY_MS), to: range.to },
    clamped: true,
  };
}

// ------------------------------------------------------------
// جلب شريحة واحدة. كل استعلام مُقيَّد بـ workspaceId ومحدود بـ take دائمًا.
// عند التصدير نستخدم cursor (أكفأ وأثبت عند الأعماق الكبيرة) بدل skip.
// ------------------------------------------------------------
type SliceOptions = { take: number; skip?: number; cursorId?: string };

// نوع الإرجاع مُصرَّح صراحة: بدونه يستنتج TypeScript اتحادًا بين شكلين مختلفين
// فيرفض Prisma الوسائط الناتجة عن النشر (...).
function cursorArgs(options: SliceOptions): { cursor?: { id: string }; skip: number } {
  if (options.cursorId) return { cursor: { id: options.cursorId }, skip: 1 };
  return { skip: options.skip ?? 0 };
}

type Slice = { rows: ReportRow[]; lastId?: string };

async function fetchSlice(
  workspaceId: string,
  type: ReportType,
  range: ReportRange,
  options: SliceOptions,
): Promise<Slice> {
  switch (type) {
    case "collection": {
      const payments = await db.payment.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        select: { id: true, date: true, amount: true, method: true, customer: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: payments.map((p) => ({
          date: p.date.toISOString().slice(0, 10),
          customer: p.customer.name,
          amount: Number(p.amount),
          method: p.method,
        })),
        lastId: payments[payments.length - 1]?.id,
      };
    }
    case "outstanding": {
      const invoices = await db.invoice.findMany({
        where: { workspaceId, status: { not: "PAID" } },
        select: {
          id: true,
          periodStart: true,
          amount: true,
          paidAmount: true,
          customer: { select: { name: true } },
        },
        orderBy: [{ periodStart: "asc" }, { id: "asc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: invoices.map((i) => ({
          customer: i.customer.name,
          period: i.periodStart.toISOString().slice(0, 10),
          amount: Number(i.amount),
          paid: Number(i.paidAmount),
          outstanding: Number(i.amount) - Number(i.paidAmount),
        })),
        lastId: invoices[invoices.length - 1]?.id,
      };
    }
    case "expense": {
      const expenses = await db.expense.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        select: { id: true, date: true, vendor: true, amount: true, category: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: expenses.map((e) => ({
          date: e.date.toISOString().slice(0, 10),
          category: e.category.name,
          vendor: e.vendor ?? "—",
          amount: Number(e.amount),
        })),
        lastId: expenses[expenses.length - 1]?.id,
      };
    }
    case "fuel": {
      const purchases = await db.fuelPurchase.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        select: { id: true, date: true, quantityLiters: true, pricePerLiter: true, totalCost: true, supplier: true },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: purchases.map((p) => ({
          date: p.date.toISOString().slice(0, 10),
          quantity: Number(p.quantityLiters),
          pricePerLiter: Number(p.pricePerLiter),
          totalCost: Number(p.totalCost),
          supplier: p.supplier ?? "—",
        })),
        lastId: purchases[purchases.length - 1]?.id,
      };
    }
    case "maintenance": {
      const records = await db.maintenanceRecord.findMany({
        where: { workspaceId, date: { gte: range.from, lte: range.to } },
        select: { id: true, date: true, type: true, technician: true, cost: true, equipment: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: records.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          equipment: r.equipment.name,
          type: r.type,
          technician: r.technician ?? "—",
          cost: Number(r.cost),
        })),
        lastId: records[records.length - 1]?.id,
      };
    }
    case "customer": {
      const customers = await db.customer.findMany({
        where: { workspaceId, deletedAt: null, createdAt: { lte: range.to } },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          subscriptions: { where: { status: "ACTIVE" }, take: 1, select: { amperes: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: options.take,
        ...cursorArgs(options),
      });
      return {
        rows: customers.map((c) => ({
          name: c.name,
          phone: c.phone ?? "—",
          amperes: c.subscriptions[0]?.amperes ?? 0,
          status: c.status,
        })),
        lastId: customers[customers.length - 1]?.id,
      };
    }
    case "profit": {
      // تجميع في قاعدة البيانات — لا تُقرأ أي صفوف إلى Node.
      // كان: أربعة findMany غير محدودة ثم reduce في الذاكرة.
      const [payments, expenses, fuel, maintenance] = await Promise.all([
        db.payment.aggregate({ where: { workspaceId, date: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
        db.expense.aggregate({ where: { workspaceId, date: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
        db.fuelPurchase.aggregate({ where: { workspaceId, date: { gte: range.from, lte: range.to } }, _sum: { totalCost: true } }),
        db.maintenanceRecord.aggregate({ where: { workspaceId, date: { gte: range.from, lte: range.to } }, _sum: { cost: true } }),
      ]);

      const revenue = Number(payments._sum.amount ?? 0);
      const totalExpenses = Number(expenses._sum.amount ?? 0);
      const totalFuel = Number(fuel._sum.totalCost ?? 0);
      const totalMaintenance = Number(maintenance._sum.cost ?? 0);

      return {
        rows: [
          { label: "إجمالي الدافع", amount: revenue },
          { label: "المصاريف", amount: totalExpenses },
          { label: "الوقود", amount: totalFuel },
          { label: "الصيانة", amount: totalMaintenance },
          { label: "صافي الربح", amount: revenue - totalExpenses - totalFuel - totalMaintenance },
        ],
      };
    }
  }
}

async function countRows(workspaceId: string, type: ReportType, range: ReportRange): Promise<number> {
  switch (type) {
    case "collection":
      return db.payment.count({ where: { workspaceId, date: { gte: range.from, lte: range.to } } });
    case "outstanding":
      return db.invoice.count({ where: { workspaceId, status: { not: "PAID" } } });
    case "expense":
      return db.expense.count({ where: { workspaceId, date: { gte: range.from, lte: range.to } } });
    case "fuel":
      return db.fuelPurchase.count({ where: { workspaceId, date: { gte: range.from, lte: range.to } } });
    case "maintenance":
      return db.maintenanceRecord.count({ where: { workspaceId, date: { gte: range.from, lte: range.to } } });
    case "customer":
      return db.customer.count({ where: { workspaceId, deletedAt: null, createdAt: { lte: range.to } } });
    case "profit":
      return 5;
  }
}

/** صفحة واحدة للعرض في الواجهة. */
export async function getReportPage(
  workspaceId: string,
  type: ReportType,
  requestedRange: ReportRange,
  options?: { page?: number; pageSize?: number },
): Promise<ReportPage> {
  const { range, clamped } = clampRange(requestedRange);
  const columns = COLUMNS[type];

  if (type === "profit") {
    const { rows } = await fetchSlice(workspaceId, type, range, { take: 5 });
    return { columns, rows, total: rows.length, page: 1, pageSize: rows.length, paginated: false, rangeClamped: clamped };
  }

  const pageSize = clampPageSize(options?.pageSize);
  const page = Math.max(1, Math.floor(options?.page ?? 1));

  const [total, slice] = await Promise.all([
    countRows(workspaceId, type, range),
    fetchSlice(workspaceId, type, range, { take: pageSize, skip: (page - 1) * pageSize }),
  ]);

  return { columns, rows: slice.rows, total, page, pageSize, paginated: true, rangeClamped: clamped };
}

/**
 * تصدير على دفعات — يُنتج الصفوف تدريجيًا بحيث لا يوجد في الذاكرة أكثر من دفعة واحدة
 * مهما بلغ حجم التقرير، مع سقف صلب لعدد الصفوف.
 */
export async function* streamReportRows(
  workspaceId: string,
  type: ReportType,
  requestedRange: ReportRange,
): AsyncGenerator<ReportRow[]> {
  const { range } = clampRange(requestedRange);

  if (type === "profit") {
    const { rows } = await fetchSlice(workspaceId, type, range, { take: 5 });
    yield rows;
    return;
  }

  let cursorId: string | undefined;
  let emitted = 0;

  for (;;) {
    const remaining = REPORT_MAX_EXPORT_ROWS - emitted;
    if (remaining <= 0) return;

    const take = Math.min(EXPORT_BATCH_SIZE, remaining);
    const slice = await fetchSlice(workspaceId, type, range, { take, cursorId });

    if (slice.rows.length === 0) return;

    emitted += slice.rows.length;
    yield slice.rows;

    if (slice.rows.length < take || !slice.lastId) return;
    cursorId = slice.lastId;
  }
}
