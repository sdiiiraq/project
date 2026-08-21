-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "scope" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("scope","identifier","bucketStart")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_bucketStart_idx" ON "rate_limit_buckets"("bucketStart");
