-- CreateTable
CREATE TABLE "help_guides" (
    "id" UUID NOT NULL,
    "pageKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mobileVideoUrl" TEXT,
    "mobileVideoId" TEXT,
    "desktopVideoUrl" TEXT,
    "desktopVideoId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_guides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_guides_pageKey_enabled_idx" ON "help_guides"("pageKey", "enabled");
