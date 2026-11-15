-- AlterEnum
ALTER TYPE "hr"."AttendanceKind" ADD VALUE 'DAY_OFF';

-- AlterTable
ALTER TABLE "hr"."Penalty" ADD COLUMN     "type" TEXT;
