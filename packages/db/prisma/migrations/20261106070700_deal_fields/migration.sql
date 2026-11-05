-- M-02 3.1 · the done-deal sheet's fields: type as a list, company and source from the client, Office Manager review, cancel.

CREATE TYPE "sales"."DealType" AS ENUM ('Rent', 'Resale', 'Primary', 'Income');

-- existing rows (if any) keep their type and get empty company/source; new rows always carry both
ALTER TABLE "sales"."Deal" ALTER COLUMN "type" TYPE "sales"."DealType" USING ("type"::"sales"."DealType");
ALTER TABLE "sales"."Deal"
ADD COLUMN "company" TEXT NOT NULL DEFAULT '',
ADD COLUMN "source" TEXT NOT NULL DEFAULT '',
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelNote" TEXT;
ALTER TABLE "sales"."Deal" ALTER COLUMN "company" DROP DEFAULT, ALTER COLUMN "source" DROP DEFAULT;

CREATE INDEX "Deal_leadId_idx" ON "sales"."Deal"("leadId");
CREATE INDEX "Deal_unitId_idx" ON "sales"."Deal"("unitId");
CREATE INDEX "DealParticipant_employeeId_idx" ON "sales"."DealParticipant"("employeeId");

ALTER TABLE "sales"."DealParticipant" ADD CONSTRAINT "DealParticipant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- serial deal codes D-301… (the demo's numbering), like the lead and unit codes
CREATE SEQUENCE IF NOT EXISTS "sales"."deal_code_seq" START WITH 301;
