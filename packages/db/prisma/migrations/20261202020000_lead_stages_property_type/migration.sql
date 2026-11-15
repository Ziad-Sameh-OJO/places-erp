-- 14.5: the «Follow up to / after Visit / Meeting» stages are gone. Their leads move to the nearest kept stage
-- (Visit or Meeting) first, the Draft stays that remember them too, then the enum is rebuilt in the client's order.
UPDATE "sales"."Lead" SET "stage" = 'VISIT' WHERE "stage" IN ('FOLLOW_UP_TO_VISIT', 'FOLLOW_UP_AFTER_VISIT');
UPDATE "sales"."Lead" SET "stage" = 'MEETING' WHERE "stage" IN ('FOLLOW_UP_TO_MEETING', 'FOLLOW_UP_AFTER_MEETING');
UPDATE "sales"."LeadDraft" SET "stage" = 'VISIT' WHERE "stage" IN ('FOLLOW_UP_TO_VISIT', 'FOLLOW_UP_AFTER_VISIT');
UPDATE "sales"."LeadDraft" SET "stage" = 'MEETING' WHERE "stage" IN ('FOLLOW_UP_TO_MEETING', 'FOLLOW_UP_AFTER_MEETING');

CREATE TYPE "sales"."LeadStage_new" AS ENUM ('FRESH', 'NO_ANSWER', 'INTERESTED', 'NOT_INTERESTED', 'VISIT', 'MEETING', 'NEAR_TO_CLOSE', 'DONE_DEAL', 'CANCELLATION', 'HOLD');
ALTER TABLE "sales"."Lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "sales"."Lead" ALTER COLUMN "stage" TYPE "sales"."LeadStage_new" USING ("stage"::text::"sales"."LeadStage_new");
ALTER TYPE "sales"."LeadStage" RENAME TO "LeadStage_old";
ALTER TYPE "sales"."LeadStage_new" RENAME TO "LeadStage";
DROP TYPE "sales"."LeadStage_old";
ALTER TABLE "sales"."Lead" ALTER COLUMN "stage" SET DEFAULT 'FRESH';

-- 14.6: Commercial · Residential · Admin office, optional on the leads that exist
ALTER TABLE "sales"."Lead" ADD COLUMN "propertyType" TEXT;
