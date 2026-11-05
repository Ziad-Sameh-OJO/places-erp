-- AlterTable
ALTER TABLE "finance"."Account" ADD COLUMN     "partyId" TEXT,
ADD COLUMN     "partyType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_partyType_partyId_key" ON "finance"."Account"("partyType", "partyId");

