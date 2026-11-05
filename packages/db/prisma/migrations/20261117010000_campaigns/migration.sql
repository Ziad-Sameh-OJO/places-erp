-- AlterTable
ALTER TABLE "marketing"."Campaign" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_archivedAt_idx" ON "marketing"."Campaign"("archivedAt");

