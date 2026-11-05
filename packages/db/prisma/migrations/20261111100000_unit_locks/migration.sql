-- CreateTable
CREATE TABLE "inventory"."UnitLock" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "inventory"."UnitType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,

    CONSTRAINT "UnitLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitLock_status_lockedAt_idx" ON "inventory"."UnitLock"("status", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLock_unitId_dealId_key" ON "inventory"."UnitLock"("unitId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLock_unitId_type_key" ON "inventory"."UnitLock"("unitId", "type");

-- AddForeignKey
ALTER TABLE "inventory"."UnitLock" ADD CONSTRAINT "UnitLock_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."UnitLock" ADD CONSTRAINT "UnitLock_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

