-- CreateTable
CREATE TABLE "marketing"."Broadcast" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "logo" BOOLEAN NOT NULL DEFAULT true,
    "hotUnitIds" TEXT[],
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing"."BroadcastSend" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otherUnits" TEXT[],
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "marketing"."Broadcast"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSend_broadcastId_userId_key" ON "marketing"."BroadcastSend"("broadcastId", "userId");

-- AddForeignKey
ALTER TABLE "marketing"."BroadcastSend" ADD CONSTRAINT "BroadcastSend_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "marketing"."Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

