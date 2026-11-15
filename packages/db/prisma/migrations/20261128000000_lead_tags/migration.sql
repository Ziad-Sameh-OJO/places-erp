-- CreateEnum
CREATE TYPE "sales"."LeadTagStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "sales"."LeadTag" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "approverId" TEXT,
    "status" "sales"."LeadTagStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadTag_approverId_status_idx" ON "sales"."LeadTag"("approverId", "status");

-- CreateIndex
CREATE INDEX "LeadTag_employeeId_status_idx" ON "sales"."LeadTag"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadTag_leadId_employeeId_key" ON "sales"."LeadTag"("leadId", "employeeId");

-- AddForeignKey
ALTER TABLE "sales"."LeadTag" ADD CONSTRAINT "LeadTag_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
