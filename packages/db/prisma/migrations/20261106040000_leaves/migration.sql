-- AlterTable
ALTER TABLE "hr"."LeaveRequest" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "hrUserId" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "tlDecidedAt" TIMESTAMP(3),
ADD COLUMN     "tlUserId" TEXT;

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "hr"."LeaveRequest"("status");
