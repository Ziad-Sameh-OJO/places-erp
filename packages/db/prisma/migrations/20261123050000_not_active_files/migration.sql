-- 2.39 · Not Active files: each sheet is a named file (made from the system, maybe empty until its sheet is uploaded),
-- grouped in folders, with who made it.
-- AlterTable
ALTER TABLE "inventory"."NotActiveSheet" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "folder" TEXT,
ALTER COLUMN "dedupeBy" SET DEFAULT '';
