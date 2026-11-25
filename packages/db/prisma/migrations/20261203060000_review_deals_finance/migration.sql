-- L11: the procurement reminder counts from when the request (re)entered Pending
ALTER TABLE "finance"."Purchase" ADD COLUMN "pendingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "finance"."Purchase" SET "pendingSince" = "createdAt";

-- Q1: the salesperson's commission % frozen when his commission was posted
ALTER TABLE "sales"."DealParticipant" ADD COLUMN "commissionPct" DECIMAL(5,2);
