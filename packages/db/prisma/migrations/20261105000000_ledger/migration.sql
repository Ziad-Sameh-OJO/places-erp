-- DropIndex
DROP INDEX "finance"."Account_name_key";

-- AlterTable
ALTER TABLE "finance"."Account" DROP COLUMN "balance",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fixed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nature" TEXT NOT NULL,
ADD COLUMN     "parentId" TEXT,
ALTER COLUMN "kind" DROP NOT NULL;

-- CreateTable
CREATE TABLE "finance"."JournalEntry" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nature" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "memo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_no_key" ON "finance"."JournalEntry"("no");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "finance"."JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "finance"."JournalEntry"("source", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "finance"."JournalLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "finance"."Account"("code");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "finance"."Account"("parentId");

-- AddForeignKey
ALTER TABLE "finance"."Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "finance"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "finance"."JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

