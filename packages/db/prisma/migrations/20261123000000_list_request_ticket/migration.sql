-- 2.32 · a TL's List request is a ticket (type «list», M-12 Marwa): its ticket, and the lookups the two screens make

-- AlterTable
ALTER TABLE "inventory"."ListRequest" ADD COLUMN     "ticketId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ListRequest_ticketId_key" ON "inventory"."ListRequest"("ticketId");

-- CreateIndex
CREATE INDEX "ListRequest_requestedBy_createdAt_idx" ON "inventory"."ListRequest"("requestedBy", "createdAt");

-- CreateIndex
CREATE INDEX "ListRequest_doneAt_createdAt_idx" ON "inventory"."ListRequest"("doneAt", "createdAt");
