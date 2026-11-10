-- 4.20 · a campaign: the budget per day, no end date until it's stopped, and the units it targets from the inventory sheet
ALTER TABLE "marketing"."Campaign" ADD COLUMN "dailyBudget" DECIMAL(14,2),
ALTER COLUMN "endsOn" DROP NOT NULL;

CREATE TABLE "marketing"."CampaignUnit" (
    "campaignId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "CampaignUnit_pkey" PRIMARY KEY ("campaignId","unitId")
);

CREATE INDEX "CampaignUnit_unitId_idx" ON "marketing"."CampaignUnit"("unitId");

ALTER TABLE "marketing"."CampaignUnit" ADD CONSTRAINT "CampaignUnit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing"."CampaignUnit" ADD CONSTRAINT "CampaignUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
