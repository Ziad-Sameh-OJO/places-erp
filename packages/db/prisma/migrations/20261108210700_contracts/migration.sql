-- M-11 · contracts: status as a list, the signed PDF, who and when, indexes for the renewal window and the calendar.

CREATE TYPE "finance"."ContractStatus" AS ENUM ('ACTIVE', 'RENEWED', 'ENDED', 'TERMINATED');

ALTER TABLE "finance"."Contract" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "finance"."Contract" ALTER COLUMN "status" TYPE "finance"."ContractStatus"
  USING (CASE "status" WHEN 'Active' THEN 'ACTIVE' WHEN 'Renewed' THEN 'RENEWED' WHEN 'Ended' THEN 'ENDED' WHEN 'Terminated' THEN 'TERMINATED' ELSE 'ACTIVE' END)::"finance"."ContractStatus";
ALTER TABLE "finance"."Contract" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- existing rows (if any) are marked as the system's
ALTER TABLE "finance"."Contract"
ADD COLUMN "fileId" TEXT,
ADD COLUMN "createdById" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "finance"."Contract" ALTER COLUMN "createdById" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "Contract_status_endsOn_idx" ON "finance"."Contract"("status", "endsOn");
CREATE INDEX "Installment_contractId_dueOn_idx" ON "finance"."Installment"("contractId", "dueOn");
CREATE INDEX "Installment_dueOn_idx" ON "finance"."Installment"("dueOn");

ALTER TABLE "finance"."Contract" ADD CONSTRAINT "Contract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- serial contract codes C-501… (the demo's numbering)
CREATE SEQUENCE IF NOT EXISTS "finance"."contract_code_seq" START WITH 501;
