-- M-11 2.2 · 2.3 · 6.4: early termination (reason, penalty), the end day, and a value change waiting for management.
ALTER TABLE "finance"."Contract" ADD COLUMN "endedOn" DATE,
ADD COLUMN "endReason" TEXT,
ADD COLUMN "penalty" DECIMAL(14,2),
ADD COLUMN "pendingValue" DECIMAL(14,2),
ADD COLUMN "pendingReason" TEXT,
ADD COLUMN "pendingById" TEXT,
ADD COLUMN "pendingAt" TIMESTAMP(3);
