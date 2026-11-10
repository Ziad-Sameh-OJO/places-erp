-- 2.40 · Not Active: a repeat is told by one or more columns (all must match), and repeats come in marked instead of
-- being dropped, so the (sheet, key) pair is no longer unique. The one column a sheet had becomes its list.
-- AlterTable
ALTER TABLE "inventory"."NotActiveSheet" ALTER COLUMN "dedupeBy" DROP DEFAULT;
ALTER TABLE "inventory"."NotActiveSheet" ALTER COLUMN "dedupeBy" SET DATA TYPE TEXT[]
  USING CASE WHEN "dedupeBy" = '' THEN ARRAY[]::TEXT[] ELSE ARRAY["dedupeBy"] END;
ALTER TABLE "inventory"."NotActiveSheet" ALTER COLUMN "dedupeBy" SET DEFAULT ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX "inventory"."NotActiveRow_sheetId_dedupeKey_key";

-- CreateIndex
CREATE INDEX "NotActiveRow_sheetId_dedupeKey_idx" ON "inventory"."NotActiveRow"("sheetId", "dedupeKey");
