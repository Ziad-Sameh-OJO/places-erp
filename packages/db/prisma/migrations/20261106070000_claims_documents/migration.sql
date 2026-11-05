-- CreateTable
CREATE TABLE "system"."Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoFileId" TEXT,
    "bank" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."DocTemplate" (
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "closing" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTemplate_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "finance"."Claim" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "dealId" TEXT,
    "company" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitInfo" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "why" TEXT,
    "requestedById" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "receiptAskedAt" TIMESTAMP(3),
    "einvoiceNo" TEXT,
    "einvoiceDate" DATE,
    "moveId" TEXT,
    "receiptNo" INTEGER,
    "payMethod" TEXT,
    "paidAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Claim_no_key" ON "finance"."Claim"("no");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_moveId_key" ON "finance"."Claim"("moveId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_receiptNo_key" ON "finance"."Claim"("receiptNo");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "finance"."Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_requestedById_idx" ON "finance"."Claim"("requestedById");

-- AddForeignKey
ALTER TABLE "finance"."Claim" ADD CONSTRAINT "Claim_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "system"."Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Claim" ADD CONSTRAINT "Claim_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "finance"."TreasuryMove"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 12.12: the two entities claims go out under; bank details are filled from «الإعدادات ← قوالب المستندات»
INSERT INTO "system"."Entity" ("id", "name", "updatedAt") VALUES ('places', 'Places', CURRENT_TIMESTAMP), ('zrain', 'ذراين للدعاية والإعلان', CURRENT_TIMESTAMP);
