import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ============================================================
// تجميع شهري في PostgreSQL.
//
// Prisma لا يدعم GROUP BY على "شهر التاريخ" (date_trunc)، ولهذا كانت كل من dashboard.ts
// وanalytics.ts تجلب كل صفوف ستة أشهر إلى Node ثم تجمعها بـ reduce/filter.
// هنا يتم التجميع في قاعدة البيانات ولا يعود إلى Node سوى صف واحد لكل شهر.
//
// أمان SQL:
//   • أسماء الجداول والأعمدة لا يمكن أن تكون معاملات في SQL، لذلك تأتي حصرًا من قائمة
//     بيضاء ثابتة معرَّفة في هذا الملف (SOURCES) — لا شيء منها يأتي من إدخال المستخدم.
//   • كل القيم (workspaceId، التواريخ) معاملات مربوطة عبر Prisma.sql، وليست نصًا مُدمجًا.
//   • كل استعلام مُقيَّد بـ "workspaceId" إلزاميًا — لا يمكن أن يعبر بيانات مستأجر آخر.
// ============================================================

type MonthlySource = {
  table: string;
  dateColumn: string;
  valueColumn: string;
};

/** القائمة البيضاء الوحيدة المسموح بها. أي مصدر خارجها يُرفض. */
const SOURCES = {
  expenses: { table: "expenses", dateColumn: "date", valueColumn: "amount" },
  fuelPurchases: { table: "fuel_purchases", dateColumn: "date", valueColumn: "totalCost" },
  maintenance: { table: "maintenance_records", dateColumn: "date", valueColumn: "cost" },
  payments: { table: "payments", dateColumn: "date", valueColumn: "amount" },
} as const satisfies Record<string, MonthlySource>;

export type MonthlySourceKey = keyof typeof SOURCES;

/** مفتاح الشهر بصيغة "YYYY-MM" (UTC) — يُستخدَم لمطابقة النتائج بأشهر التقرير. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * مجموع القيمة لكل شهر ضمن المدى، لمولدة واحدة.
 * يُعيد Map من "YYYY-MM" إلى المجموع. الأشهر بلا بيانات لا تظهر (تُعامَل كصفر عند القراءة).
 */
export async function monthlySums(
  source: MonthlySourceKey,
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const { table, dateColumn, valueColumn } = SOURCES[source];

  const rows = await db.$queryRaw<{ month: Date; total: bigint | number }[]>(Prisma.sql`
    SELECT date_trunc('month', ${Prisma.raw(`"${dateColumn}"`)}) AS month,
           COALESCE(SUM(${Prisma.raw(`"${valueColumn}"`)}), 0) AS total
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND ${Prisma.raw(`"${dateColumn}"`)} >= ${from}
      AND ${Prisma.raw(`"${dateColumn}"`)} <= ${to}
    GROUP BY 1
  `);

  return new Map(rows.map((row) => [monthKey(new Date(row.month)), Number(row.total)]));
}

/**
 * عدد المشتركين الجدد لكل شهر (غير المحذوفين منطقيًا).
 * يُستخدَم مع رقم أساس للحصول على منحنى تراكمي دون استعلام منفصل لكل شهر.
 */
export async function monthlyNewCustomers(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ month: Date; total: bigint | number }[]>(Prisma.sql`
    SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS total
    FROM "customers"
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY 1
  `);

  return new Map(rows.map((row) => [monthKey(new Date(row.month)), Number(row.total)]));
}

/**
 * عدد المشتركين المقطوعين شهريًا، من سجل التدقيق.
 * الفلترة على قيمة الحقل JSON والتجميع الشهري يحدثان في PostgreSQL — سابقًا كانت كل
 * سجلات تغيير الحالة لستة أشهر تُجلب إلى Node ثم تُصفّى وتُعدّ هناك.
 */
export async function monthlyDisconnections(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ month: Date; total: bigint | number }[]>(Prisma.sql`
    SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS total
    FROM "audit_logs"
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "action" = 'customer.status_change'
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
      AND "after"->>'status' = 'DISCONNECTED'
    GROUP BY 1
  `);

  return new Map(rows.map((row) => [monthKey(new Date(row.month)), Number(row.total)]));
}
