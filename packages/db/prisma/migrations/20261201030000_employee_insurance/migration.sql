-- AlterTable
ALTER TABLE "finance"."PayrollLine" ADD COLUMN     "insurance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "hr"."EmployeeInsurance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insured" BOOLEAN NOT NULL DEFAULT true,
    "since" DATE,
    "provider" TEXT NOT NULL DEFAULT '',
    "monthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "companyShare" DECIMAL(14,2),
    "note" TEXT,
    "files" TEXT[],
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeInsurance_userId_key" ON "hr"."EmployeeInsurance"("userId");
