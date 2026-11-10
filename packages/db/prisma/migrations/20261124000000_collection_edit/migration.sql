-- 5.15: a collection keeps its receive voucher (to correct it: reverse + new entry) and its last manual correction
-- AlterTable
ALTER TABLE "sales"."Payment" ADD COLUMN     "editReason" TEXT,
ADD COLUMN     "editedFrom" DECIMAL(14,2),
ADD COLUMN     "moveId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_moveId_key" ON "sales"."Payment"("moveId");

-- the collections recorded before this: their voucher has the deal's code as ref, the same amount, safe and day
WITH p AS (
  SELECT p.id, d.code, p.amount, p."accountId", p."receivedAt",
         row_number() OVER (PARTITION BY d.code, p.amount, p."accountId", p."receivedAt" ORDER BY p."createdAt", p.id) AS rn
  FROM "sales"."Payment" p JOIN "sales"."Deal" d ON d.id = p."dealId"
), m AS (
  SELECT id, ref, amount, "toId", date,
         row_number() OVER (PARTITION BY ref, amount, "toId", date ORDER BY no) AS rn
  FROM "finance"."TreasuryMove" WHERE kind = 'receive'
)
UPDATE "sales"."Payment" x SET "moveId" = m.id
FROM p JOIN m ON m.ref = p.code AND m.amount = p.amount AND m."toId" = p."accountId" AND m.date = p."receivedAt" AND m.rn = p.rn
WHERE x.id = p.id;
