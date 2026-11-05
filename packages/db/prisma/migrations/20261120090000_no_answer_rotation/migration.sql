-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "naMarkedAt" TIMESTAMP(3),
ADD COLUMN     "naMarkedById" TEXT,
ADD COLUMN     "newLeadRequestedAt" TIMESTAMP(3),
ADD COLUMN     "newLeadRequestedById" TEXT,
ADD COLUMN     "newLeadRoutedAt" TIMESTAMP(3),
ADD COLUMN     "newLeadRoutedById" TEXT;

