-- 1.9 · Visit or Meeting (4 Nov demo meeting): the new stage before Meeting, and the Alarm sent once per visit time.
ALTER TYPE "sales"."LeadStage" ADD VALUE 'FOLLOW_UP_TO_MEETING' BEFORE 'MEETING';

ALTER TABLE "sales"."LeadVisit" ADD COLUMN "alarmedAt" TIMESTAMP(3);
