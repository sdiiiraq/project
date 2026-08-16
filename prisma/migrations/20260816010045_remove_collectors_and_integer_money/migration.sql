-- إزالة مفهوم "الجابي" نهائيًا: الجداول، الصلاحية، وأي منح صلاحية مرتبطة بها.
ALTER TABLE "payments" DROP COLUMN "collectorUserId";
ALTER TABLE "platform_plans" DROP COLUMN "collectorLimit";

DROP TABLE "collector_assignments";
DROP TABLE "collector_settlements";
DROP TYPE "SettlementStatus";

DELETE FROM "workspace_member_permissions" WHERE "permissionKey" = 'collectors.manage';
DELETE FROM "permissions" WHERE "key" = 'collectors.manage';

-- الدينار العراقي كرقم صحيح فقط: تحويل كل حقول المبالغ من Decimal إلى Integer، مع تقريب
-- أي كسور موجودة فعليًا في البيانات الحالية لأقرب رقم صحيح (ROUND) بدلاً من إخفائها بالواجهة فقط.
ALTER TABLE "workspaces"
  ALTER COLUMN "normalAmperePriceIQD" TYPE INTEGER USING ROUND("normalAmperePriceIQD")::INTEGER,
  ALTER COLUMN "goldAmperePriceIQD" TYPE INTEGER USING ROUND("goldAmperePriceIQD")::INTEGER;

ALTER TABLE "ampere_plans"
  ALTER COLUMN "monthlyPrice" TYPE INTEGER USING ROUND("monthlyPrice")::INTEGER;

ALTER TABLE "customer_ampere_history"
  ALTER COLUMN "oldPrice" TYPE INTEGER USING ROUND("oldPrice")::INTEGER,
  ALTER COLUMN "newPrice" TYPE INTEGER USING ROUND("newPrice")::INTEGER;

ALTER TABLE "customer_subscriptions"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::INTEGER;

ALTER TABLE "invoices"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER,
  ALTER COLUMN "paidAmount" DROP DEFAULT,
  ALTER COLUMN "paidAmount" TYPE INTEGER USING ROUND("paidAmount")::INTEGER,
  ALTER COLUMN "paidAmount" SET DEFAULT 0;

ALTER TABLE "payments"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER;

ALTER TABLE "payment_adjustments"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER;

ALTER TABLE "ledger_entries"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER;

ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER;

ALTER TABLE "fuel_purchases"
  ALTER COLUMN "pricePerLiter" TYPE INTEGER USING ROUND("pricePerLiter")::INTEGER,
  ALTER COLUMN "totalCost" TYPE INTEGER USING ROUND("totalCost")::INTEGER;

ALTER TABLE "maintenance_records"
  ALTER COLUMN "cost" TYPE INTEGER USING ROUND("cost")::INTEGER;

ALTER TABLE "platform_plans"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::INTEGER;

ALTER TABLE "platform_subscriptions"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::INTEGER;

ALTER TABLE "billing_transactions"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER;
