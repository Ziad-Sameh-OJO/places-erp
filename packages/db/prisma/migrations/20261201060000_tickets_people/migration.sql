-- AlterTable
ALTER TABLE "ops"."Ticket" ADD COLUMN     "forDepartment" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ops"."TicketAssignee" (
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAssignee_pkey" PRIMARY KEY ("ticketId","userId")
);

-- CreateIndex
CREATE INDEX "TicketAssignee_userId_idx" ON "ops"."TicketAssignee"("userId");

-- AddForeignKey
ALTER TABLE "ops"."TicketAssignee" ADD CONSTRAINT "TicketAssignee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ops"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
