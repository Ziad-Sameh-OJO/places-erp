-- 11.18 · the employee's quarterly sheet: the lines management picks (on the bands row) and the award rules
-- AlterTable
ALTER TABLE "kpi"."KpiBands" ADD COLUMN     "sheetFields" TEXT[] DEFAULT ARRAY['salary', 'target', 'achieved', 'scheme', 'commission', 'bonus']::TEXT[];

-- CreateTable
CREATE TABLE "kpi"."KpiBonusRule" (
    "id" TEXT NOT NULL,
    "minPct" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiBonusRule_pkey" PRIMARY KEY ("id")
);
