-- 1.33 · M-01: the Team Leader's note on a lead, and when its salesperson saw it
ALTER TABLE "sales"."Lead" ADD COLUMN "tlNote" TEXT,
  ADD COLUMN "tlNoteAt" TIMESTAMP(3),
  ADD COLUMN "tlNoteById" TEXT,
  ADD COLUMN "tlNoteSeenAt" TIMESTAMP(3);
