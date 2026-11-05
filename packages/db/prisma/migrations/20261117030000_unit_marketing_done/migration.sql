-- AlterTable
ALTER TABLE "inventory"."Unit" ADD COLUMN     "marketingDoneAt" TIMESTAMP(3);

-- The units that were already in the inventory aren't «new» for marketing: only units added from now on wait on its board.
UPDATE "inventory"."Unit" SET "marketingDoneAt" = CURRENT_TIMESTAMP;
