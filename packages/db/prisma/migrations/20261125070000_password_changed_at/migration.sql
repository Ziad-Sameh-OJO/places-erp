-- 12.15 · «حسابي»: «آخر تغيير للباسورد» (set by activation, reset and change)
-- AlterTable
ALTER TABLE "access"."User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
