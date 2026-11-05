-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "draft" TEXT;

-- CreateTable
CREATE TABLE "sales"."LeadDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromId" TEXT,
    "stage" TEXT NOT NULL,
    "days" INTEGER,
    "keptAt" TIMESTAMP(3),
    "keptById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decision" TEXT,
    "toId" TEXT,

    CONSTRAINT "LeadDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadDraft_kind_decidedAt_idx" ON "sales"."LeadDraft"("kind", "decidedAt");

-- CreateIndex
CREATE INDEX "LeadDraft_leadId_idx" ON "sales"."LeadDraft"("leadId");

-- AddForeignKey
ALTER TABLE "sales"."LeadDraft" ADD CONSTRAINT "LeadDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

