// تحقق ما بعد الترحيل: يؤكد أن كل ما أُضيف موجود فعلًا، وأن الـ backfill صحيح.
// التشغيل:  node scripts/verify-migration.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

try {
  const tables = await db.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('billing_jobs','ai_rate_limit_buckets','rate_limit_buckets','cron_runs')`);
  const found = new Set(tables.map((t) => t.table_name));
  for (const t of ["billing_jobs", "ai_rate_limit_buckets", "rate_limit_buckets", "cron_runs"]) {
    check(`جدول ${t}`, found.has(t));
  }

  const cols = await db.$queryRawUnsafe(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='workspaces' AND column_name='subscriberSequence')
        OR (table_name='platform_plans' AND column_name='aiRequestLimit'))`);
  check("عمود workspaces.subscriberSequence", cols.some((c) => c.column_name === "subscriberSequence"));
  check("عمود platform_plans.aiRequestLimit", cols.some((c) => c.column_name === "aiRequestLimit"));

  const ext = await db.$queryRawUnsafe(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`);
  check("امتداد pg_trgm", ext.length > 0);

  const idx = await db.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('customers_name_idx','customers_phone_idx',
                        'customers_workspaceId_createdAt_idx',
                        'notifications_workspaceId_createdAt_idx','audit_logs_createdAt_idx')`);
  check("الفهارس الخمسة الجديدة", idx.length === 5, `${idx.length}/5`);

  // الأهم: الـ backfill. أي مولدة عدّادها أقل من أعلى رقم مشترك لديها ستُنتج تعارضًا.
  const bad = await db.$queryRawUnsafe(`
    SELECT w.id, w.name, w."subscriberSequence" AS seq,
           COALESCE(MAX(CASE WHEN c."subscriberNumber" ~ '^[0-9]+$'
                             THEN c."subscriberNumber"::bigint ELSE 0 END), 0) AS max_num
    FROM workspaces w LEFT JOIN customers c ON c."workspaceId" = w.id
    GROUP BY w.id, w.name, w."subscriberSequence"
    HAVING w."subscriberSequence" < COALESCE(MAX(CASE WHEN c."subscriberNumber" ~ '^[0-9]+$'
                                       THEN c."subscriberNumber"::bigint ELSE 0 END), 0)`);
  check("backfill عدّاد أرقام المشتركين", bad.length === 0,
    bad.length ? `⚠️ ${bad.length} مولدة عدّادها متأخر — أول مشترك جديد سيفشل!` : "كل المولدات سليمة");
  for (const row of bad.slice(0, 5)) console.log(`      ${row.name}: seq=${row.seq} < max=${row.max_num}`);

  console.log(failures === 0 ? "\n✅ الترحيل مكتمل وسليم." : `\n❌ ${failures} فحص فشل — لا تنشر قبل حلها.`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error("فشل التحقق:", e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
