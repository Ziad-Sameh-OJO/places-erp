-- CreateTable
CREATE TABLE "sales"."CommissionPayout" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dealId" TEXT,
    "tcrId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "moveId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_moveId_key" ON "sales"."CommissionPayout"("moveId");

-- CreateIndex
CREATE INDEX "CommissionPayout_employeeId_idx" ON "sales"."CommissionPayout"("employeeId");

-- CreateIndex
CREATE INDEX "CommissionPayout_dealId_idx" ON "sales"."CommissionPayout"("dealId");

-- AddForeignKey
ALTER TABLE "sales"."CommissionPayout" ADD CONSTRAINT "CommissionPayout_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."CommissionPayout" ADD CONSTRAINT "CommissionPayout_tcrId_fkey" FOREIGN KEY ("tcrId") REFERENCES "sales"."Tcr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
