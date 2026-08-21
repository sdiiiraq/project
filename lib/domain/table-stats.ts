import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// عدّ تقريبي لعدد صفوف جدول، من إحصاءات المُخطِّط (pg_class.reltuples).
//
// السبب: COUNT(*) بلا شرط على جدول ضخم يفرض فحصًا كاملًا في PostgreSQL — سجل التدقيق
// مرشّح ليكون أكبر جداول المنصّة، وعدّه بدقة في كل تحميل صفحة إدارية يعيد إنتاج
// نفس فئة المشكلة التي نعالجها. الرقم التقريبي كافٍ تمامًا لعرض عدد الصفحات.
//
// الدقة: يُحدَّث بواسطة ANALYZE/autovacuum، فقد يتأخر قليلًا عن الواقع. مقبول للعرض،
// وغير مقبول لأي منطق مالي أو أمني — لا تستخدمه لغير العرض.

/** قائمة بيضاء: أسماء الجداول لا يمكن أن تكون معاملات SQL، فتأتي من هنا حصرًا. */
const TABLES = { auditLogs: "audit_logs" } as const;

export type EstimatableTable = keyof typeof TABLES;

export async function estimatedRowCount(table: EstimatableTable): Promise<number> {
  const rows = await db.$queryRaw<{ estimate: bigint | number }[]>(Prisma.sql`
    SELECT GREATEST(reltuples, 0)::bigint AS estimate
    FROM pg_class
    WHERE oid = ${Prisma.raw(`'"${TABLES[table]}"'`)}::regclass
  `);

  return Number(rows[0]?.estimate ?? 0);
}
