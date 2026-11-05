-- AlterTable
ALTER TABLE "sales"."Client" ADD COLUMN     "deletionAskedAt" TIMESTAMP(3),
ADD COLUMN     "deletionAskedBy" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "marketingConsent" BOOLEAN;

