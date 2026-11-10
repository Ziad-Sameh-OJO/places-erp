-- 4.15 · a task «تتحسب في الـ KPIs؟» (Skip by default): «أيوه» counts in the assignee's «المهام في ميعادها» (doneAt is already there)
-- AlterTable
ALTER TABLE "marketing"."Task" ADD COLUMN     "countsInKpi" BOOLEAN NOT NULL DEFAULT false;
