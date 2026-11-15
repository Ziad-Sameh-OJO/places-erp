-- 14.7: comments before this time are hidden from the lead's new holder (Super Admin sees all)
ALTER TABLE "sales"."Lead" ADD COLUMN "commentsFrom" TIMESTAMP(3);
