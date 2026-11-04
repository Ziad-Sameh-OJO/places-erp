-- CreateTable
CREATE TABLE "finance"."FinancePeriod" (
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePeriod_pkey" PRIMARY KEY ("month")
);

