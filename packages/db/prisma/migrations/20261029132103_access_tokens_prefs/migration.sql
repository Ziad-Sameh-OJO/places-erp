-- CreateEnum
CREATE TYPE "access"."AuthTokenKind" AS ENUM ('INVITE', 'RESET', 'OTP');

-- AlterTable
ALTER TABLE "access"."Role" ADD COLUMN     "builtIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "access"."User" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "access"."AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "access"."AuthTokenKind" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthToken_userId_kind_idx" ON "access"."AuthToken"("userId", "kind");

-- AddForeignKey
ALTER TABLE "access"."AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
