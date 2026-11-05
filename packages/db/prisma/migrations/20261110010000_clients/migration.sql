-- CreateEnum
CREATE TYPE "sales"."ClientKind" AS ENUM ('client', 'owner', 'both');

-- CreateEnum
CREATE TYPE "sales"."ClientStatus" AS ENUM ('active', 'inactive');

-- AlterTable
ALTER TABLE "inventory"."Unit" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "sales"."Lead" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "sales"."Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "kind" "sales"."ClientKind" NOT NULL,
    "status" "sales"."ClientStatus" NOT NULL DEFAULT 'active',
    "preferredContact" TEXT,
    "lastContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."ClientPhone" (
    "phone" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPhone_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "sales"."ClientInteraction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_kind_idx" ON "sales"."Client"("kind");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "sales"."Client"("name");

-- CreateIndex
CREATE INDEX "Client_status_lastContactAt_idx" ON "sales"."Client"("status", "lastContactAt");

-- CreateIndex
CREATE INDEX "ClientPhone_clientId_idx" ON "sales"."ClientPhone"("clientId");

-- CreateIndex
CREATE INDEX "ClientInteraction_clientId_at_idx" ON "sales"."ClientInteraction"("clientId", "at");

-- CreateIndex
CREATE INDEX "Unit_ownerId_idx" ON "inventory"."Unit"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_clientId_idx" ON "sales"."Lead"("clientId");

-- AddForeignKey
ALTER TABLE "sales"."Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."ClientPhone" ADD CONSTRAINT "ClientPhone_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."ClientInteraction" ADD CONSTRAINT "ClientInteraction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."Unit" ADD CONSTRAINT "Unit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "sales"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

