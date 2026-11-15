-- CreateTable
CREATE TABLE "sales"."LeadUnitStep" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitIds" TEXT[],
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadUnitStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadUnitStep_leadId_at_idx" ON "sales"."LeadUnitStep"("leadId", "at");

-- AddForeignKey
ALTER TABLE "sales"."LeadUnitStep" ADD CONSTRAINT "LeadUnitStep_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

