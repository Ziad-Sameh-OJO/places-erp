-- CreateTable
CREATE TABLE "sales"."DailyCalls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCalls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCalls_userId_day_key" ON "sales"."DailyCalls"("userId", "day");

-- M-01 (client, 11 Nov): the «By Telesales» channel joins the channels list (M-13) where it isn't there yet
UPDATE "system"."Setting"
SET "value" = "value" || '[{"value": "By Telesales", "active": true}]'::jsonb
WHERE "key" = 'channels' AND jsonb_typeof("value") = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("value") e WHERE e->>'value' = 'By Telesales' OR e #>> '{}' = 'By Telesales');
