-- AlterTable
ALTER TABLE "kpi"."KpiCard" DROP COLUMN "draft",
ALTER COLUMN "payAmount" DROP NOT NULL,
ALTER COLUMN "payAmount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kpi"."KpiItem" DROP COLUMN "delivered",
DROP COLUMN "manualValue",
DROP COLUMN "measurement",
ADD COLUMN     "baseline" DECIMAL(14,2),
ADD COLUMN     "enteredBy" TEXT[] DEFAULT ARRAY['follower']::TEXT[],
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "method" TEXT NOT NULL,
ADD COLUMN     "params" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "report" TEXT,
ADD COLUMN     "value" DECIMAL(14,2),
ALTER COLUMN "source" SET DEFAULT '';

-- CreateTable
CREATE TABLE "kpi"."KpiQuarter" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "KpiQuarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."KpiDelivery" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT NOT NULL,
    "link" TEXT,
    "fileId" TEXT,

    CONSTRAINT "KpiDelivery_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "kpi"."KpiCard" ADD CONSTRAINT "KpiCard_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi"."KpiCard" ADD CONSTRAINT "KpiCard_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "hr"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi"."KpiDelivery" ADD CONSTRAINT "KpiDelivery_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "kpi"."KpiItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- M-12 5.1: «مؤشرات الأداء» is a page for everyone (my card, my team); the Office Manager runs the money and closes
-- the quarter (demo perms). Roles the admin already set up for kpis keep their matrix.
INSERT INTO "access"."RolePermission" ("roleId", "module", "actions")
SELECT "id", 'kpis', CASE WHEN "key" = 'officemgr' THEN ARRAY['view','create','edit','approve','delete','import','export'] ELSE ARRAY['view'] END
FROM "access"."Role" ON CONFLICT DO NOTHING;
