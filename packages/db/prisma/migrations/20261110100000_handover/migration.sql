-- CreateTable
CREATE TABLE "access"."Handover" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "leads" INTEGER,
    "tasks" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Handover_approverId_status_idx" ON "access"."Handover"("approverId", "status");

-- CreateIndex
CREATE INDEX "Handover_fromUserId_status_idx" ON "access"."Handover"("fromUserId", "status");
