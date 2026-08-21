-- ============================================================
-- تراجع عن ترحيلات التوسع (2026-08-18 → 2026-08-19)
--
-- ⚠️ لا تُشغّل هذا إلا إذا احتجت العودة إلى ما قبل الترحيلات الستة.
-- ⚠️ يحذف جداول التوسع وبياناتها (أعمال الفوترة، عدّادات الاستخدام، سجلات التشغيل).
--    لا يمسّ أي بيانات موجودة قبل الترحيل: المشتركون والفواتير والدفعات وسجل التدقيق
--    تبقى كما هي تمامًا.
--
-- كل الترحيلات إضافية (جداول وأعمدة وفهارس جديدة فقط)، فالتراجع حذف ما أُضيف.
--
-- طريقة التشغيل (استبدل العنوان بـ DIRECT_URL الخاص بك — منفذ 5432):
--   psql "postgresql://...:5432/postgres" -f prisma/migrations/ROLLBACK.sql
--
-- بعده احذف مجلدات الترحيلات الستة من prisma/migrations/ وشغّل: npx prisma generate
-- ============================================================

BEGIN;

-- 20260819160000_cron_run_observability
DROP TABLE IF EXISTS "cron_runs";
DROP TYPE  IF EXISTS "CronRunStatus";

-- 20260819150000_pagination_sort_indexes
DROP INDEX IF EXISTS "customers_workspaceId_createdAt_idx";
DROP INDEX IF EXISTS "notifications_workspaceId_createdAt_idx";
DROP INDEX IF EXISTS "audit_logs_createdAt_idx";

-- 20260819140000_generic_rate_limit_buckets
DROP TABLE IF EXISTS "rate_limit_buckets";

-- 20260819130000_customer_search_trigram_indexes
DROP INDEX IF EXISTS "customers_name_idx";
DROP INDEX IF EXISTS "customers_phone_idx";
-- الامتداد يبقى: قد تستخدمه أشياء أخرى، وإسقاطه ليس ضروريًا للتراجع.
-- DROP EXTENSION IF EXISTS pg_trgm;

-- 20260819120000_atomic_subscriber_sequence
-- ملاحظة: حذف العمود يفقد العدّاد. أرقام المشتركين الموجودة لا تتأثر،
-- لكن الكود القديم سيعود إلى COUNT(*) + 1 بما فيه من سباق.
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "subscriberSequence";

-- 20260818190000_scalability_billing_jobs_ai_limits
DROP TABLE IF EXISTS "billing_jobs";
DROP TYPE  IF EXISTS "BillingJobStatus";
DROP TABLE IF EXISTS "ai_rate_limit_buckets";
ALTER TABLE "platform_plans" DROP COLUMN IF EXISTS "aiRequestLimit";

-- سجل الترحيلات في Prisma
DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN (
  '20260818190000_scalability_billing_jobs_ai_limits',
  '20260819120000_atomic_subscriber_sequence',
  '20260819130000_customer_search_trigram_indexes',
  '20260819140000_generic_rate_limit_buckets',
  '20260819150000_pagination_sort_indexes',
  '20260819160000_cron_run_observability'
);

COMMIT;
