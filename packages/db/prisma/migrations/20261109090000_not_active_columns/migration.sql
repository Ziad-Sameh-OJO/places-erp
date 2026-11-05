-- 2.14 · Not Active sheets keep their own headers (the client hasn't sent the CFC columns yet), rows their arrival order.

-- AlterTable
ALTER TABLE "inventory"."NotActiveRow" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "inventory"."NotActiveSheet" ADD COLUMN     "columns" TEXT[] DEFAULT ARRAY[]::TEXT[];
