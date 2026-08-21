-- CreateEnum
CREATE TYPE "BillingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "platform_plans" ADD COLUMN     "aiRequestLimit" INTEGER;

-- CreateTable
CREATE TABLE "billing_jobs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "cycle" TEXT NOT NULL,
    "status" "BillingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "invoicesCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_rate_limit_buckets" (
    "workspaceId" UUID NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_rate_limit_buckets_pkey" PRIMARY KEY ("workspaceId","bucketStart")
);

-- CreateIndex
CREATE INDEX "billing_jobs_status_runAfter_idx" ON "billing_jobs"("status", "runAfter");

-- CreateIndex
CREATE INDEX "billing_jobs_cycle_status_idx" ON "billing_jobs"("cycle", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_jobs_workspaceId_cycle_key" ON "billing_jobs"("workspaceId", "cycle");

-- CreateIndex
CREATE INDEX "ai_rate_limit_buckets_bucketStart_idx" ON "ai_rate_limit_buckets"("bucketStart");

-- AddForeignKey
ALTER TABLE "billing_jobs" ADD CONSTRAINT "billing_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_rate_limit_buckets" ADD CONSTRAINT "ai_rate_limit_buckets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

