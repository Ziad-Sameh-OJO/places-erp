-- DropIndex
DROP INDEX "ops"."Ticket_code_key";

-- AlterTable
ALTER TABLE "ops"."Ticket" DROP COLUMN "code",
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "number" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "ops"."TicketEvent" ALTER COLUMN "byUserId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "ops"."Ticket"("number");

-- CreateIndex
CREATE INDEX "Ticket_department_status_idx" ON "ops"."Ticket"("department", "status");

-- CreateIndex
CREATE INDEX "Ticket_fromUserId_idx" ON "ops"."Ticket"("fromUserId");

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "ops"."Ticket"("createdAt");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_at_idx" ON "ops"."TicketEvent"("ticketId", "at");

