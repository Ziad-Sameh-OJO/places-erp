-- AlterTable
ALTER TABLE "marketing"."Task" ADD COLUMN     "note" TEXT,
ALTER COLUMN "byUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Task_unitId_idx" ON "marketing"."Task"("unitId");

-- AddForeignKey
ALTER TABLE "marketing"."Task" ADD CONSTRAINT "Task_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

