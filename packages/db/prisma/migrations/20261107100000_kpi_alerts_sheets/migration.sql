-- AlterTable
ALTER TABLE "kpi"."KpiCard" ADD COLUMN     "midAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kpi"."KpiQuarter" ADD COLUMN     "sheetsAt" TIMESTAMP(3),
ADD COLUMN     "sheetsById" TEXT;
