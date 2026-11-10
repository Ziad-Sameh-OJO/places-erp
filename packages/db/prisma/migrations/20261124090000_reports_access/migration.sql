-- 11.20 · «التقارير والتارجت» for the heads only: who else a head opened it for
-- CreateTable
CREATE TABLE "access"."ReportsAccess" (
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportsAccess_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "access"."ReportsAccess" ADD CONSTRAINT "ReportsAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
