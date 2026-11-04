-- AlterTable
ALTER TABLE "system"."AuditLog" ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_userId_at_idx" ON "system"."AuditLog"("userId", "at");

