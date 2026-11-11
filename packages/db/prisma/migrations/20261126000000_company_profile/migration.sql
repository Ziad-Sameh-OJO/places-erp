-- CreateTable
CREATE TABLE "marketing"."CompanyProfileLogo" (
    "dealId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfileLogo_pkey" PRIMARY KEY ("dealId")
);

-- CreateTable
CREATE TABLE "marketing"."CompanyProfileVersion" (
    "id" TEXT NOT NULL,
    "baseFileId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "dealIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyProfileLogo_doneAt_idx" ON "marketing"."CompanyProfileLogo"("doneAt");

-- CreateIndex
CREATE INDEX "CompanyProfileVersion_createdAt_idx" ON "marketing"."CompanyProfileVersion"("createdAt");
