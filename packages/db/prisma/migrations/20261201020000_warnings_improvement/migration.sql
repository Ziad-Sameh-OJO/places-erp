-- CreateTable
CREATE TABLE "hr"."Warning" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rule" TEXT,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    "issuedAt" TIMESTAMP(3),
    "byUserId" TEXT,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."ImprovementPlan" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "tlUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "goals" TEXT,
    "actions" TEXT,
    "dueDate" DATE,
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warning_status_idx" ON "hr"."Warning"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Warning_employeeId_rule_month_key" ON "hr"."Warning"("employeeId", "rule", "month");

-- CreateIndex
CREATE INDEX "ImprovementPlan_tlUserId_status_idx" ON "hr"."ImprovementPlan"("tlUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementPlan_employeeId_month_key" ON "hr"."ImprovementPlan"("employeeId", "month");
