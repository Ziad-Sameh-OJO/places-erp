-- AlterTable
ALTER TABLE "inventory"."NotActiveRow" ADD COLUMN     "matchSeen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchedUnitId" TEXT;

-- AlterTable
ALTER TABLE "inventory"."NotActiveSheet" ADD COLUMN     "numberBy" TEXT;

-- CreateIndex
CREATE INDEX "NotActiveRow_sheetId_status_idx" ON "inventory"."NotActiveRow"("sheetId", "status");

