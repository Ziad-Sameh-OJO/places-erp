-- CreateTable
CREATE TABLE "sales"."LeadBulk" (
    "id" TEXT NOT NULL,
    "numbers" TEXT[],
    "channel" TEXT NOT NULL,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "excluded" TEXT[],
    "reason" TEXT,
    "byUserId" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadBulk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadBulk_status_createdAt_idx" ON "sales"."LeadBulk"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "sales"."LeadBulk" ADD CONSTRAINT "LeadBulk_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

