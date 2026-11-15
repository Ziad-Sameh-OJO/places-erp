-- 14.1 · each person's dashboard layout (null = the smaller dashboard of his role)
ALTER TABLE "access"."User" ADD COLUMN "dashboard" TEXT;
