-- 1.29 · Official holidays become ranges «من … لحد …» (client demo meeting, 4 Nov: an Eid is several days, and there's
-- no «holiday mode» switch any more). Every one-day holiday becomes a range of that one day; nothing is lost.
ALTER TABLE "system"."Holiday" ADD COLUMN "id" TEXT, ADD COLUMN "from" DATE, ADD COLUMN "to" DATE;
UPDATE "system"."Holiday" SET "id" = 'hol_' || to_char("day", 'YYYYMMDD'), "from" = "day", "to" = "day";
ALTER TABLE "system"."Holiday"
  ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "from" SET NOT NULL, ALTER COLUMN "to" SET NOT NULL,
  DROP CONSTRAINT "Holiday_pkey",
  ADD CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id"),
  ADD CONSTRAINT "Holiday_range_check" CHECK ("from" <= "to"),
  DROP COLUMN "day";
CREATE INDEX "Holiday_from_idx" ON "system"."Holiday"("from");

-- The SLA times the admin set on M-13 (setting «slaRules») move into «قواعد الليدز» (setting «leadRules», 1.29), which
-- the page and the jobs read now; what isn't saved there keeps its default (the API merges with them).
INSERT INTO "system"."Setting" ("key", "value", "updatedAt")
SELECT 'leadRules', jsonb_build_object('sla', jsonb_build_object(
  'warnMin', ("value"->>'warnAfter')::int, 'pullMin', ("value"->>'pullAfter')::int,
  'holWarnMin', ("value"->>'holidayWarnAfter')::int, 'holPullMin', ("value"->>'holidayPullAfter')::int)), now()
FROM "system"."Setting" WHERE "key" = 'slaRules'
ON CONFLICT ("key") DO NOTHING;
DELETE FROM "system"."Setting" WHERE "key" = 'slaRules';
