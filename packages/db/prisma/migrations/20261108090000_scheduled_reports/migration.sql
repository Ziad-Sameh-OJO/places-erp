-- CreateTable
CREATE TABLE "kpi"."ScheduledReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL,
    "freq" TEXT NOT NULL,
    "day" INTEGER NOT NULL DEFAULT 0,
    "time" TEXT NOT NULL,
    "fmt" TEXT NOT NULL DEFAULT 'جوه السيستم',
    "content" TEXT,
    "preparedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remindMin" INTEGER NOT NULL DEFAULT 60,
    "lateNotify" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "money" BOOLEAN NOT NULL DEFAULT false,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."ReportHandIn" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "lateAt" TIMESTAMP(3),

    CONSTRAINT "ReportHandIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."ReportRun" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."DailyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."DailyReportField" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."SalesTarget" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "deals" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "pending" JSONB,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportHandIn_reportId_userId_period_key" ON "kpi"."ReportHandIn"("reportId", "userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRun_reportId_period_key" ON "kpi"."ReportRun"("reportId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_userId_day_key" ON "kpi"."DailyReport"("userId", "day");

-- CreateIndex
CREATE INDEX "DailyReportField_userId_idx" ON "kpi"."DailyReportField"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_employeeId_month_key" ON "kpi"."SalesTarget"("employeeId", "month");

-- AddForeignKey
ALTER TABLE "kpi"."ReportHandIn" ADD CONSTRAINT "ReportHandIn_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "kpi"."ScheduledReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi"."ReportRun" ADD CONSTRAINT "ReportRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "kpi"."ScheduledReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

