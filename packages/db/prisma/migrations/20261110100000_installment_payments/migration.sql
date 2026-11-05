-- AlterTable
ALTER TABLE "finance"."Installment" ADD COLUMN     "alerts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "finance"."InstallmentPayment" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallmentPayment_installmentId_idx" ON "finance"."InstallmentPayment"("installmentId");

-- CreateIndex
CREATE INDEX "InstallmentPayment_paidOn_idx" ON "finance"."InstallmentPayment"("paidOn");

-- AddForeignKey
ALTER TABLE "finance"."InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "finance"."Installment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

