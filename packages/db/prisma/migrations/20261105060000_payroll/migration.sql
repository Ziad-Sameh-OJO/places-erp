-- CreateTable
CREATE TABLE "finance"."PayrollRun" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "attendance" DECIMAL(14,2) NOT NULL,
    "advance" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."AdvanceDeduction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_key" ON "finance"."PayrollRun"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_moveId_key" ON "finance"."PayrollRun"("moveId");

-- CreateIndex
CREATE INDEX "PayrollLine_userId_idx" ON "finance"."PayrollLine"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvanceDeduction_userId_month_key" ON "finance"."AdvanceDeduction"("userId", "month");

-- AddForeignKey
ALTER TABLE "finance"."PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "finance"."PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
