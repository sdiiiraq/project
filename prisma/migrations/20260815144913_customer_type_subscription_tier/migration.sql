-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'NORMAL');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('NORMAL', 'GOLD');

-- Workspace: split single ampere price into normal/gold prices, preserving the existing configured value
ALTER TABLE "workspaces" ADD COLUMN "normalAmperePriceIQD" DECIMAL(14,2);
ALTER TABLE "workspaces" ADD COLUMN "goldAmperePriceIQD" DECIMAL(14,2);
UPDATE "workspaces" SET "normalAmperePriceIQD" = "amperePriceIQD" WHERE "amperePriceIQD" IS NOT NULL;
ALTER TABLE "workspaces" DROP COLUMN "amperePriceIQD";

-- Customer: classification field
ALTER TABLE "customers" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'NORMAL';

-- CustomerSubscription: tier field (existing rows default to NORMAL, matching their current single-price billing)
ALTER TABLE "customer_subscriptions" ADD COLUMN "tier" "SubscriptionTier" NOT NULL DEFAULT 'NORMAL';

-- AmperePlan: tier field + widen unique constraint so the same ampere count can have a normal and a gold price
ALTER TABLE "ampere_plans" ADD COLUMN "tier" "SubscriptionTier" NOT NULL DEFAULT 'NORMAL';
DROP INDEX "ampere_plans_workspaceId_amperes_isCustom_key";
CREATE UNIQUE INDEX "ampere_plans_workspaceId_amperes_isCustom_tier_key" ON "ampere_plans"("workspaceId", "amperes", "isCustom", "tier");
