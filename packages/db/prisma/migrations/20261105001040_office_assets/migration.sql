-- CreateTable
CREATE TABLE "ops"."OfficeAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "place" TEXT NOT NULL DEFAULT '',
    "needsRepair" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."OfficeAssetReview" (
    "id" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeAssetReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."OfficeBoyShift" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slots" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeBoyShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeAsset_archivedAt_idx" ON "ops"."OfficeAsset"("archivedAt");

-- CreateIndex
CREATE INDEX "OfficeAssetReview_at_idx" ON "ops"."OfficeAssetReview"("at");
