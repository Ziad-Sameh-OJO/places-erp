-- AlterTable
ALTER TABLE "inventory"."Unit" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "layout" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "project" SET DEFAULT '',
ALTER COLUMN "area" SET DEFAULT '',
ALTER COLUMN "space" SET DEFAULT 0,
ALTER COLUMN "condition" SET DEFAULT '';

