-- 2.5 · Area tabs under the inventory list (M-03 7.2): the team's own ranges, and the tab a unit was put in.
-- AlterTable
ALTER TABLE "inventory"."Unit" ADD COLUMN     "areaTabId" TEXT;

-- CreateTable
CREATE TABLE "inventory"."AreaTab" (
    "id" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaTab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unit_areaTabId_idx" ON "inventory"."Unit"("areaTabId");

-- AddForeignKey
ALTER TABLE "inventory"."Unit" ADD CONSTRAINT "Unit_areaTabId_fkey" FOREIGN KEY ("areaTabId") REFERENCES "inventory"."AreaTab"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The ranges the team works with today (M-03 1.1 «من ٢٠ الي ١٠٠ … من ١٠١ الي ٢٠٠», 7.2 «201 to 500 · 501 to 800 · +»).
-- Written once here, not by the seed, so a tab Manar removes doesn't come back.
INSERT INTO "inventory"."AreaTab" ("id", "min", "max") VALUES
  ('areatab_20_100', 20, 100), ('areatab_101_200', 101, 200), ('areatab_201_500', 201, 500),
  ('areatab_501_800', 501, 800), ('areatab_801_up', 801, NULL);
