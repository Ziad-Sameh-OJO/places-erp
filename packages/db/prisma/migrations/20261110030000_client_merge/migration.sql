-- CreateEnum
CREATE TYPE "sales"."ClientMergeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "sales"."Client" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "sales"."ClientMerge" (
    "id" TEXT NOT NULL,
    "keepId" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "status" "sales"."ClientMergeStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "suggestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientMerge_status_idx" ON "sales"."ClientMerge"("status");


-- M-10 2.2: Operations approve merges (clients:approve). The seed builds a role once, so seeded databases get it here,
-- only where the role still has the seed's clients matrix: a matrix the admin changed is left as it is.
UPDATE "access"."RolePermission" rp
SET "actions" = ARRAY['view', 'create', 'edit', 'approve']::TEXT[]
FROM "access"."Role" r
WHERE rp."roleId" = r."id" AND r."key" IN ('ops', 'opshead') AND rp."module" = 'clients'
  AND rp."actions" = ARRAY['view', 'create', 'edit']::TEXT[];
