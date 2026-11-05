-- CreateTable
CREATE TABLE "inventory"."InventoryReport" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "sendTo" TEXT[],
    "day" DATE NOT NULL,
    "newUnits" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "closed" INTEGER NOT NULL,
    "unconfirmed" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,

    CONSTRAINT "InventoryReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReport_day_key" ON "inventory"."InventoryReport"("day");

