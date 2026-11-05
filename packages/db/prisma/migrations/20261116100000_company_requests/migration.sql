-- AlterTable
ALTER TABLE "sales"."Company" ADD COLUMN     "contactedOn" DATE,
ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "sales"."CompanyRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyRequest_status_createdAt_idx" ON "sales"."CompanyRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "sales"."CompanyRequest" ADD CONSTRAINT "CompanyRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

