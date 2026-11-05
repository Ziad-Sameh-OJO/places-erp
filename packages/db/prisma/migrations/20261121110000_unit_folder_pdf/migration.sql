-- 2.22 · a PDF in the unit's «Pic & Info» folder (never its cover or a brochure photo)
-- AlterTable
ALTER TABLE "inventory"."UnitPhoto" ADD COLUMN     "pdf" BOOLEAN NOT NULL DEFAULT false;
