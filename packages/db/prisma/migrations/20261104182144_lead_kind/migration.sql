-- CreateEnum
CREATE TYPE "sales"."LeadKind" AS ENUM ('CLIENT', 'BROKER');

-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "kind" "sales"."LeadKind" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "selfEntered" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lead_kind_idx" ON "sales"."Lead"("kind");

-- Leads a salesperson entered for himself: the one who created it is the one it's assigned to.
UPDATE "sales"."Lead" l SET "selfEntered" = true
FROM "hr"."Employee" e
WHERE e."id" = l."assignedToId" AND e."userId" = l."createdById";
