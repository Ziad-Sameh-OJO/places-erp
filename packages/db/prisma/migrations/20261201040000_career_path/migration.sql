-- CreateTable
CREATE TABLE "hr"."CareerTrack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."CareerLevel" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quarters" INTEGER,
    "minKpi" INTEGER,
    "minTarget" INTEGER,
    "minMonths" INTEGER,

    CONSTRAINT "CareerLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."CareerMove" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerTrack_name_key" ON "hr"."CareerTrack"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CareerLevel_trackId_position_key" ON "hr"."CareerLevel"("trackId", "position");

-- CreateIndex
CREATE INDEX "CareerMove_employeeId_day_idx" ON "hr"."CareerMove"("employeeId", "day");

-- AddForeignKey
ALTER TABLE "hr"."CareerLevel" ADD CONSTRAINT "CareerLevel_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "hr"."CareerTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."CareerMove" ADD CONSTRAINT "CareerMove_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."CareerMove" ADD CONSTRAINT "CareerMove_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "hr"."CareerLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starter data: one neutral sample track for the client to replace (HR, 15 Nov): Junior → Senior after 2 quarters, KPIs ≥ 85%, target ≥ 100%
INSERT INTO "hr"."CareerTrack" ("id", "name", "sample") VALUES ('career-sample-sales', 'Sales', true);
INSERT INTO "hr"."CareerLevel" ("id", "trackId", "name", "position", "quarters", "minKpi", "minTarget", "minMonths") VALUES
  ('career-sample-junior', 'career-sample-sales', 'Junior', 0, NULL, NULL, NULL, NULL),
  ('career-sample-senior', 'career-sample-sales', 'Senior', 1, 2, 85, 100, NULL);
