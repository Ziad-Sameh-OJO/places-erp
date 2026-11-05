-- CreateTable
CREATE TABLE "hr"."DeductionApproval" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeductionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeductionApproval_month_key" ON "hr"."DeductionApproval"("month");

