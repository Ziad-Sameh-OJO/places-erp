-- CreateTable
CREATE TABLE "hr"."ExcuseRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_tl',
    "ticketId" TEXT,
    "tlUserId" TEXT,
    "hrUserId" TEXT,
    "rejectReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ExcuseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExcuseRequest_ticketId_key" ON "hr"."ExcuseRequest"("ticketId");

-- CreateIndex
CREATE INDEX "ExcuseRequest_employeeId_day_idx" ON "hr"."ExcuseRequest"("employeeId", "day");
