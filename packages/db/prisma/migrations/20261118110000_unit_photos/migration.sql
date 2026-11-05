-- CreateTable
CREATE TABLE "inventory"."UnitPhoto" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitPhoto_fileId_key" ON "inventory"."UnitPhoto"("fileId");

-- CreateIndex
CREATE INDEX "UnitPhoto_unitId_position_idx" ON "inventory"."UnitPhoto"("unitId", "position");

-- AddForeignKey
ALTER TABLE "inventory"."UnitPhoto" ADD CONSTRAINT "UnitPhoto_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

