-- 2.35 · «Layout file»: a folder of files per unit (PDF · DWG · images) instead of Layout Yes / No.
-- Layout is now worked out from the folder (it has files), so the Yes / No column goes.
-- CreateTable
CREATE TABLE "inventory"."UnitLayout" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitLayout_fileId_key" ON "inventory"."UnitLayout"("fileId");

-- CreateIndex
CREATE INDEX "UnitLayout_unitId_idx" ON "inventory"."UnitLayout"("unitId");

-- AddForeignKey
ALTER TABLE "inventory"."UnitLayout" ADD CONSTRAINT "UnitLayout_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "inventory"."Unit" DROP COLUMN "layout";
