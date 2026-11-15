-- CreateTable
CREATE TABLE "hr"."CompanyEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "place" TEXT,
    "description" TEXT NOT NULL,
    "imageFileId" TEXT,
    "departments" TEXT[],
    "createdById" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayBeforeSentAt" TIMESTAMP(3),
    "morningSentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyEvent_date_idx" ON "hr"."CompanyEvent"("date");
