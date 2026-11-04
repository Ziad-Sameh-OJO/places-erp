-- M-08 10.1: purchase requests on an expense account. Nothing wrote finance.Purchase before this, so the table is empty.
-- DropForeignKey
ALTER TABLE "finance"."Purchase" DROP CONSTRAINT "Purchase_lineId_fkey";

-- DropIndex
DROP INDEX "finance"."Purchase_code_key";

-- AlterTable
ALTER TABLE "finance"."Purchase" DROP COLUMN "approvedBy",
DROP COLUMN "code",
DROP COLUMN "lineId",
DROP COLUMN "paidAt",
DROP COLUMN "paidFrom",
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "moveId" TEXT,
ADD COLUMN     "no" SERIAL NOT NULL,
ADD COLUMN     "paidFromId" TEXT,
ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "postedById" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settledById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_no_key" ON "finance"."Purchase"("no");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_moveId_key" ON "finance"."Purchase"("moveId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "finance"."Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_createdById_idx" ON "finance"."Purchase"("createdById");

-- CreateIndex
CREATE INDEX "Purchase_accountId_idx" ON "finance"."Purchase"("accountId");

-- AddForeignKey
ALTER TABLE "finance"."Purchase" ADD CONSTRAINT "Purchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Purchase" ADD CONSTRAINT "Purchase_paidFromId_fkey" FOREIGN KEY ("paidFromId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Purchase" ADD CONSTRAINT "Purchase_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "finance"."TreasuryMove"("id") ON DELETE SET NULL ON UPDATE CASCADE;

