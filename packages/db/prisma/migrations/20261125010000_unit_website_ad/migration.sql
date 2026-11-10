-- 4.13 · «Website Ads» Yes / No on a unit, marketing's own column: when it was marked posted and by whom (null = No)
-- AlterTable
ALTER TABLE "inventory"."Unit" ADD COLUMN     "websiteAdAt" TIMESTAMP(3),
ADD COLUMN     "websiteAdById" TEXT;
