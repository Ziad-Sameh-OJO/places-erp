-- CreateTable
CREATE TABLE "access"."RoleFieldRule" (
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "mode" TEXT NOT NULL,

    CONSTRAINT "RoleFieldRule_pkey" PRIMARY KEY ("roleId","module","field")
);

-- AddForeignKey
ALTER TABLE "access"."RoleFieldRule" ADD CONSTRAINT "RoleFieldRule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

