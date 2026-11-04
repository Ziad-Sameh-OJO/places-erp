-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "firstActionAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "post" TEXT,
ADD COLUMN     "rotation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "slaWarnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sales"."LeadVisit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'visit',
    "at" TIMESTAMP(3) NOT NULL,
    "extra" TEXT,
    "outcome" TEXT,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."VisitUnit" (
    "visitId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "VisitUnit_pkey" PRIMARY KEY ("visitId","unitId")
);

-- CreateTable
CREATE TABLE "sales"."LeadUnit" (
    "leadId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadUnit_pkey" PRIMARY KEY ("leadId","unitId")
);

-- CreateIndex
CREATE INDEX "LeadVisit_leadId_at_idx" ON "sales"."LeadVisit"("leadId", "at");

-- CreateIndex
CREATE INDEX "LeadVisit_at_idx" ON "sales"."LeadVisit"("at");

-- CreateIndex
CREATE INDEX "LeadUnit_unitId_idx" ON "sales"."LeadUnit"("unitId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "sales"."Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_phones_idx" ON "sales"."Lead" USING GIN ("phones");

-- AddForeignKey
ALTER TABLE "sales"."LeadVisit" ADD CONSTRAINT "LeadVisit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."VisitUnit" ADD CONSTRAINT "VisitUnit_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "sales"."LeadVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."VisitUnit" ADD CONSTRAINT "VisitUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadUnit" ADD CONSTRAINT "LeadUnit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadUnit" ADD CONSTRAINT "LeadUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

