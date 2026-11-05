-- M-11 2.4 · 7.1: which renewal alerts (90 / 60 / 30 days) went out, and the renewal lead the first one opened.
ALTER TABLE "finance"."Contract" ADD COLUMN "renewalAlerts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "renewalLeadId" TEXT;
