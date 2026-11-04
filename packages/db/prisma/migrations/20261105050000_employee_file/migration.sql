-- AlterTable
ALTER TABLE "hr"."Employee" ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "partTimeDeductions" BOOLEAN NOT NULL DEFAULT false;
