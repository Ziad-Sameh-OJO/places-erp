-- AlterTable
ALTER TABLE "hr"."AttendanceDay" ADD COLUMN     "visitAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales"."LeadVisit" ADD COLUMN     "postponeDecidedAt" TIMESTAMP(3),
ADD COLUMN     "postponeDecidedBy" TEXT,
ADD COLUMN     "postponeReason" TEXT,
ADD COLUMN     "postponeRequestedBy" TEXT,
ADD COLUMN     "postponeStatus" TEXT;
