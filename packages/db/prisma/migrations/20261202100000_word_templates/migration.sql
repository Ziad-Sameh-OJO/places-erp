-- «المستندات» (client, 25 Nov): the Word templates and the documents issued from them
CREATE TABLE "system"."WordTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "seeRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seeUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mode" TEXT NOT NULL DEFAULT 'notify',
    "approverIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stamp" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "WordTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system"."WordDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "fileId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WordDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WordDocument_code_key" ON "system"."WordDocument"("code");
CREATE INDEX "WordDocument_userId_createdAt_idx" ON "system"."WordDocument"("userId", "createdAt");
CREATE INDEX "WordDocument_status_idx" ON "system"."WordDocument"("status");
ALTER TABLE "system"."WordDocument" ADD CONSTRAINT "WordDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "system"."WordTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DOC-1001…: serial codes, like the deals' and contracts'
CREATE SEQUENCE "system"."word_document_code_seq" START 1001;
