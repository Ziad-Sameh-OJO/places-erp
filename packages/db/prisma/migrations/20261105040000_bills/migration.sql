-- AlterTable
ALTER TABLE "finance"."BudgetLine" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "finance"."RecurringBill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "day" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notifiedFor" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."RecurringBillMonth" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "moveId" TEXT,
    "reason" TEXT,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBillMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringBillMonth_billId_month_key" ON "finance"."RecurringBillMonth"("billId", "month");

-- AddForeignKey
ALTER TABLE "finance"."RecurringBillMonth" ADD CONSTRAINT "RecurringBillMonth_billId_fkey" FOREIGN KEY ("billId") REFERENCES "finance"."RecurringBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

