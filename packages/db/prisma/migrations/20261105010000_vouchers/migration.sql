-- AlterTable
ALTER TABLE "finance"."Account" ADD COLUMN     "holderId" TEXT;

-- AlterTable
ALTER TABLE "finance"."BudgetLine" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "alert" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'month';

-- CreateTable
CREATE TABLE "finance"."TreasuryMove" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fromId" TEXT,
    "toId" TEXT,
    "accountId" TEXT,
    "expenseId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "spent" DECIMAL(14,2),
    "returned" DECIMAL(14,2),
    "party" TEXT NOT NULL,
    "partyId" TEXT,
    "ref" TEXT,
    "memo" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryMove_no_key" ON "finance"."TreasuryMove"("no");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryMove_entryId_key" ON "finance"."TreasuryMove"("entryId");

-- CreateIndex
CREATE INDEX "TreasuryMove_fromId_idx" ON "finance"."TreasuryMove"("fromId");

-- CreateIndex
CREATE INDEX "TreasuryMove_toId_idx" ON "finance"."TreasuryMove"("toId");

-- CreateIndex
CREATE INDEX "TreasuryMove_date_idx" ON "finance"."TreasuryMove"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_accountId_key" ON "finance"."BudgetLine"("accountId");

-- AddForeignKey
ALTER TABLE "finance"."BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."TreasuryMove" ADD CONSTRAINT "TreasuryMove_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."TreasuryMove" ADD CONSTRAINT "TreasuryMove_toId_fkey" FOREIGN KEY ("toId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."TreasuryMove" ADD CONSTRAINT "TreasuryMove_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

