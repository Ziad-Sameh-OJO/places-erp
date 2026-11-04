-- CreateTable
CREATE TABLE "sales"."LeadArrival" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "campaignId" TEXT,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "byUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadArrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."LeadDuplicate" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "arrivalId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decision" JSONB,

    CONSTRAINT "LeadDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadArrival_leadId_idx" ON "sales"."LeadArrival"("leadId");

-- CreateIndex
CREATE INDEX "LeadArrival_campaignId_at_idx" ON "sales"."LeadArrival"("campaignId", "at");

-- CreateIndex
CREATE INDEX "LeadArrival_channel_at_idx" ON "sales"."LeadArrival"("channel", "at");

-- CreateIndex
CREATE UNIQUE INDEX "LeadDuplicate_arrivalId_key" ON "sales"."LeadDuplicate"("arrivalId");

-- CreateIndex
CREATE INDEX "LeadDuplicate_decidedAt_idx" ON "sales"."LeadDuplicate"("decidedAt");

-- AddForeignKey
ALTER TABLE "sales"."LeadArrival" ADD CONSTRAINT "LeadArrival_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadArrival" ADD CONSTRAINT "LeadArrival_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadDuplicate" ADD CONSTRAINT "LeadDuplicate_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadDuplicate" ADD CONSTRAINT "LeadDuplicate_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "sales"."LeadArrival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Leads that already exist count once for their own channel / campaign, at the time they arrived.
INSERT INTO "sales"."LeadArrival" ("id", "leadId", "channel", "campaignId", "duplicate", "byUserId", "at")
SELECT gen_random_uuid()::text, "id", "channel", "campaignId", false, NULL, "arrivedAt" FROM "sales"."Lead";
