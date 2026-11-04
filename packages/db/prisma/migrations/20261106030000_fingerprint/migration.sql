-- CreateTable
CREATE TABLE "hr"."FingerprintUnmatched" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FingerprintUnmatched_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."FingerprintAlias" (
    "name" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FingerprintAlias_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "FingerprintUnmatched_name_day_key" ON "hr"."FingerprintUnmatched"("name", "day");
