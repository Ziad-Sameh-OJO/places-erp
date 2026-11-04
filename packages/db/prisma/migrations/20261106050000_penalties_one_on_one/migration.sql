-- AlterTable
ALTER TABLE "hr"."OneOnOne" ADD COLUMN     "alarmedAt" TIMESTAMP(3),
ADD COLUMN     "byUserId" TEXT;

-- AlterTable
ALTER TABLE "hr"."Penalty" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "deductionDays" DECIMAL(4,2) NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'approved';

-- CreateIndex
CREATE INDEX "Penalty_day_idx" ON "hr"."Penalty"("day");
