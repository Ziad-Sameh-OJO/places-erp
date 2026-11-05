-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_createdAt_idx" ON "hr"."LeaveRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "OneOnOne_employeeId_heldOn_idx" ON "hr"."OneOnOne"("employeeId", "heldOn");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "finance"."JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "File_status_createdAt_idx" ON "system"."File"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayrollLine_runId_idx" ON "finance"."PayrollLine"("runId");

