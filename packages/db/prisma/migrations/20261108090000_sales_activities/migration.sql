-- CreateTable
CREATE TABLE "kpi"."SalesActivity" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "got" BOOLEAN,
    "note" TEXT,
    "companies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesActivity_employeeId_at_idx" ON "kpi"."SalesActivity"("employeeId", "at");

-- AddForeignKey
ALTER TABLE "kpi"."SalesActivity" ADD CONSTRAINT "SalesActivity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
