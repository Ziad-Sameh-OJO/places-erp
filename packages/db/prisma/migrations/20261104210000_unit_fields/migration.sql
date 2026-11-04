-- 2.1 · The unit's full sheet (M-03 3.1, sources/inventory-unit-fields.md): typed type / status, the columns every
-- type shares, the computed total for price filters, and the U-101… code sequence.

CREATE TYPE "inventory"."UnitType" AS ENUM ('Rent', 'Resale', 'Income', 'Primary');
CREATE TYPE "inventory"."UnitStatus" AS ENUM ('available', 'rented', 'sold');

-- type / status were free text: cast what's there (case-insensitive). A value that isn't a known type stops the
-- migration instead of being guessed. The demo's «closed» second side becomes rented or sold by that side's type.
ALTER TABLE "inventory"."Unit"
  ALTER COLUMN "type" TYPE "inventory"."UnitType" USING (
    CASE lower(trim("type")) WHEN 'rent' THEN 'Rent' WHEN 'resale' THEN 'Resale' WHEN 'income' THEN 'Income' WHEN 'primary' THEN 'Primary' ELSE "type" END
  )::"inventory"."UnitType",
  ALTER COLUMN "alsoType" TYPE "inventory"."UnitType" USING (
    CASE lower(trim("alsoType")) WHEN 'rent' THEN 'Rent' WHEN 'resale' THEN 'Resale' WHEN 'income' THEN 'Income' WHEN 'primary' THEN 'Primary' WHEN '' THEN NULL ELSE "alsoType" END
  )::"inventory"."UnitType",
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "inventory"."UnitStatus" USING (lower(trim("status")))::"inventory"."UnitStatus",
  ALTER COLUMN "status" SET DEFAULT 'available',
  ALTER COLUMN "alsoStatus" TYPE "inventory"."UnitStatus" USING (
    CASE lower(trim("alsoStatus"))
      WHEN '' THEN NULL
      WHEN 'closed' THEN CASE WHEN lower(trim("alsoType")) = 'rent' THEN 'rented' ELSE 'sold' END
      ELSE lower(trim("alsoStatus"))
    END
  )::"inventory"."UnitStatus",
  ALTER COLUMN "details" SET DEFAULT '{}',
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerPhone" TEXT,
  ADD COLUMN "totalPrice" DECIMAL(14,2),
  ADD COLUMN "leasePerSqm" DECIMAL(14,2),
  ADD COLUMN "maintenance" TEXT,
  ADD COLUMN "commission" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "splitNote" TEXT,
  ADD COLUMN "createdById" TEXT;

-- rows from before: the total the domain would have written (pricePerSqm × space)
UPDATE "inventory"."Unit" SET "totalPrice" = round("pricePerSqm" * "space", 2) WHERE "pricePerSqm" IS NOT NULL;

CREATE INDEX "Unit_area_idx" ON "inventory"."Unit"("area");
CREATE INDEX "Unit_space_idx" ON "inventory"."Unit"("space");
CREATE INDEX "Unit_totalPrice_idx" ON "inventory"."Unit"("totalPrice");
CREATE INDEX "Unit_ownerPhone_idx" ON "inventory"."Unit"("ownerPhone");

-- Serial codes U-101, U-102… (M-03 3.2) come from a sequence, so two units saved at once never share a code.
-- If codes were written by hand before, it continues after the highest one.
CREATE SEQUENCE IF NOT EXISTS "inventory"."unit_code_seq" START WITH 101;
SELECT setval('"inventory"."unit_code_seq"', m) FROM (
  SELECT max(substring(code FROM '^U-(\d+)$')::bigint) AS m FROM "inventory"."Unit"
) x WHERE m >= 101;
