-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "firstCallAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sales"."LeadCall" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCall_byUserId_at_idx" ON "sales"."LeadCall"("byUserId", "at");

-- CreateIndex
CREATE INDEX "LeadCall_leadId_at_idx" ON "sales"."LeadCall"("leadId", "at");

-- AddForeignKey
ALTER TABLE "sales"."LeadCall" ADD CONSTRAINT "LeadCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
