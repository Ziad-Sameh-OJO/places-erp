-- CreateTable
CREATE TABLE "system"."MailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "notificationId" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailLog_status_nextAttemptAt_idx" ON "system"."MailLog"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MailLog_createdAt_idx" ON "system"."MailLog"("createdAt");

-- AddForeignKey
ALTER TABLE "system"."MailLog" ADD CONSTRAINT "MailLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "system"."Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
