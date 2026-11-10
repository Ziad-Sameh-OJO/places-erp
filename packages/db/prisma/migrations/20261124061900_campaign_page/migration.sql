-- 4.19 · a campaign's «Page name», from the list marketing keeps (demo 9 Nov: Website · Property Finder · Dubizzle)
ALTER TABLE "marketing"."Campaign" ADD COLUMN "page" TEXT;

CREATE TABLE "marketing"."CampaignPage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignPage_name_key" ON "marketing"."CampaignPage"("name");

INSERT INTO "marketing"."CampaignPage" ("id", "name") VALUES ('page-website', 'Website'), ('page-property-finder', 'Property Finder'), ('page-dubizzle', 'Dubizzle');
