-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "access";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hr";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "kpi";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "marketing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ops";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateEnum
CREATE TYPE "access"."AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "access"."DataScope" AS ENUM ('OWN', 'TEAM', 'DEPT', 'ALL');

-- CreateEnum
CREATE TYPE "hr"."AttendanceKind" AS ENUM ('CHECKIN', 'EXCUSE', 'VISIT', 'OUTSIDE_APPROVED', 'FORGOT', 'ABSENT', 'SPECIAL_SCHEDULE');

-- CreateEnum
CREATE TYPE "hr"."LeaveStatus" AS ENUM ('PENDING_TL', 'APPROVED_BY_TL', 'REJECTED', 'CLOSED_BY_HR');

-- CreateEnum
CREATE TYPE "sales"."LeadStage" AS ENUM ('FRESH', 'INTERESTED', 'NOT_INTERESTED', 'NO_ANSWER', 'FOLLOW_UP_TO_VISIT', 'VISIT', 'FOLLOW_UP_AFTER_VISIT', 'MEETING', 'FOLLOW_UP_AFTER_MEETING', 'NEAR_TO_CLOSE', 'DONE_DEAL', 'CANCELLATION', 'HOLD');

-- CreateEnum
CREATE TYPE "sales"."DealStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'PARTIALLY_COLLECTED', 'FULLY_COLLECTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sales"."DealSide" AS ENUM ('BUYER', 'SELLER');

-- CreateTable
CREATE TABLE "access"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "status" "access"."AccountStatus" NOT NULL DEFAULT 'INVITED',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "otpRequired" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access"."Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "behavesLike" TEXT,
    "scope" "access"."DataScope" NOT NULL DEFAULT 'OWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access"."RolePermission" (
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "actions" TEXT[],

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","module")
);

-- CreateTable
CREATE TABLE "access"."UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "access"."PermissionOverride" (
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "actions" TEXT[],

    CONSTRAINT "PermissionOverride_pkey" PRIMARY KEY ("userId","module")
);

-- CreateTable
CREATE TABLE "hr"."Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "managerId" TEXT,
    "teamLeaderId" TEXT,
    "team" TEXT,
    "salary" DECIMAL(14,2) NOT NULL,
    "target" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "partTime" BOOLEAN NOT NULL DEFAULT false,
    "deductionTiers" JSONB,
    "fixedSchedule" TEXT,
    "leaveBalance" INTEGER NOT NULL DEFAULT 21,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."AttendanceDay" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "kind" "hr"."AttendanceKind" NOT NULL DEFAULT 'CHECKIN',
    "deduction" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "hrConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromDay" DATE NOT NULL,
    "toDay" DATE NOT NULL,
    "reason" TEXT,
    "status" "hr"."LeaveStatus" NOT NULL DEFAULT 'PENDING_TL',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Penalty" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."OneOnOne" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "heldOn" DATE NOT NULL,
    "answers" JSONB NOT NULL,
    "hrAction" TEXT,
    "hrActionDue" DATE,
    "hrActionDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Lead" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "phones" TEXT[],
    "area" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "space" INTEGER,
    "condition" TEXT,
    "budget" DECIMAL(14,2),
    "channel" TEXT NOT NULL,
    "campaignId" TEXT,
    "stage" "sales"."LeadStage" NOT NULL DEFAULT 'FRESH',
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "touched" BOOLEAN NOT NULL DEFAULT false,
    "ownedByTelesales" BOOLEAN NOT NULL DEFAULT false,
    "noAnswerCount" INTEGER NOT NULL DEFAULT 0,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "byUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "number" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "email" TEXT,
    "currentLocation" TEXT,
    "currentSpace" INTEGER,
    "contractStart" DATE,
    "contractEnd" DATE,
    "averageRent" DECIMAL(14,2),
    "annualEscalation" DECIMAL(5,2),
    "feedback" TEXT,
    "outbound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Deal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "leadId" TEXT,
    "unitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "space" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "status" "sales"."DealStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "commissionOwner" DECIMAL(14,2) NOT NULL,
    "commissionClient" DECIMAL(14,2) NOT NULL,
    "targetBase" DECIMAL(14,2),
    "note" TEXT,
    "offTarget" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "execDueAt" DATE,
    "executedAt" DATE,
    "papersOk" BOOLEAN,
    "papersNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."DealParticipant" (
    "dealId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "side" "sales"."DealSide" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DealParticipant_pkey" PRIMARY KEY ("dealId","employeeId")
);

-- CreateTable
CREATE TABLE "sales"."Payment" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Tcr" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "dealId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "pdfKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tcr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."TcrSignature" (
    "tcrId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "TcrSignature_pkey" PRIMARY KEY ("tcrId","employeeId")
);

-- CreateTable
CREATE TABLE "inventory"."Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "alsoType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "alsoStatus" TEXT,
    "project" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "space" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "floor" TEXT,
    "building" TEXT,
    "parking" INTEGER NOT NULL DEFAULT 0,
    "pricePerSqm" DECIMAL(14,2),
    "details" JSONB NOT NULL,
    "agentId" TEXT,
    "divisible" BOOLEAN NOT NULL DEFAULT false,
    "minSplit" INTEGER,
    "location" TEXT,
    "pdfStatus" TEXT NOT NULL DEFAULT 'draft',
    "receivedAt" TIMESTAMP(3),
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mediaUrl" TEXT,
    "mediaUploadedAt" TIMESTAMP(3),
    "lastOwnerUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."NotActiveSheet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dedupeBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotActiveSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."NotActiveRow" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT,
    "feedback" TEXT,
    "assignedTo" TEXT,
    "unitId" TEXT,

    CONSTRAINT "NotActiveRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."ListRequest" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "unitCodes" TEXT[],
    "unconfirmed" INTEGER NOT NULL DEFAULT 0,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing"."Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL,
    "spent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "target" TEXT,
    "adUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing"."Task" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "unitId" TEXT,
    "byUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "returned" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."Ticket" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "fromUserId" TEXT NOT NULL,
    "firstReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "cap" DECIMAL(14,2),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."BudgetLine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL,
    "spent" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Purchase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "lineId" TEXT NOT NULL,
    "vendor" TEXT,
    "attachments" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "approvedBy" TEXT,
    "rejectReason" TEXT,
    "paidFrom" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Contract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "escalation" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Installment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."KpiCard" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "followerId" TEXT,
    "payBase" TEXT NOT NULL DEFAULT 'bonus',
    "payPeriod" TEXT NOT NULL DEFAULT 'quarter',
    "payAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finalScore" DECIMAL(6,2),
    "finalAmount" DECIMAL(14,2),
    "plan" TEXT,
    "draft" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KpiCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."KpiItem" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "targetText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "measurement" TEXT NOT NULL,
    "module" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'at-least',
    "goal" DECIMAL(14,2) NOT NULL,
    "metric" TEXT,
    "manualValue" DECIMAL(14,2),
    "required" INTEGER,
    "delivered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KpiItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi"."KpiBands" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "top" INTEGER NOT NULL DEFAULT 100,
    "full" INTEGER NOT NULL DEFAULT 96,
    "partial" INTEGER NOT NULL DEFAULT 70,
    "low" INTEGER NOT NULL DEFAULT 50,
    "rewardPct" INTEGER NOT NULL DEFAULT 15,
    "cutPct" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "KpiBands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."Holiday" (
    "day" DATE NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "system"."Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "system"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."NotificationRule" (
    "event" TEXT NOT NULL,
    "toRoles" TEXT[],
    "channels" TEXT[],

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("event")
);

-- CreateTable
CREATE TABLE "system"."AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "access"."User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "access"."Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "access"."Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "hr"."Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDay_employeeId_day_key" ON "hr"."AttendanceDay"("employeeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_code_key" ON "sales"."Lead"("code");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_stage_idx" ON "sales"."Lead"("assignedToId", "stage");

-- CreateIndex
CREATE INDEX "Lead_area_idx" ON "sales"."Lead"("area");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_at_idx" ON "sales"."LeadActivity"("leadId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_number_key" ON "sales"."Company"("name", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_code_key" ON "sales"."Deal"("code");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "sales"."Deal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tcr_code_key" ON "sales"."Tcr"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tcr_paymentId_key" ON "sales"."Tcr"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "inventory"."Unit"("code");

-- CreateIndex
CREATE INDEX "Unit_type_status_idx" ON "inventory"."Unit"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotActiveSheet_name_key" ON "inventory"."NotActiveSheet"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NotActiveRow_sheetId_dedupeKey_key" ON "inventory"."NotActiveRow"("sheetId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Task_toUserId_status_idx" ON "marketing"."Task"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_code_key" ON "ops"."Ticket"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "finance"."Account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_name_key" ON "finance"."BudgetLine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_code_key" ON "finance"."Purchase"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_code_key" ON "finance"."Contract"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_dealId_key" ON "finance"."Contract"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiCard_quarter_employeeId_key" ON "kpi"."KpiCard"("quarter", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiItem_cardId_position_key" ON "kpi"."KpiItem"("cardId", "position");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "system"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_at_idx" ON "system"."AuditLog"("module", "at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "system"."AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "access"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."PermissionOverride" ADD CONSTRAINT "PermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "access"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "hr"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."Employee" ADD CONSTRAINT "Employee_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "hr"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."AttendanceDay" ADD CONSTRAINT "AttendanceDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."Penalty" ADD CONSTRAINT "Penalty_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."OneOnOne" ADD CONSTRAINT "OneOnOne_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Deal" ADD CONSTRAINT "Deal_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory"."Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."DealParticipant" ADD CONSTRAINT "DealParticipant_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Payment" ADD CONSTRAINT "Payment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Tcr" ADD CONSTRAINT "Tcr_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales"."Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."Tcr" ADD CONSTRAINT "Tcr_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "sales"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."TcrSignature" ADD CONSTRAINT "TcrSignature_tcrId_fkey" FOREIGN KEY ("tcrId") REFERENCES "sales"."Tcr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."NotActiveRow" ADD CONSTRAINT "NotActiveRow_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "inventory"."NotActiveSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ops"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Purchase" ADD CONSTRAINT "Purchase_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "finance"."BudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Installment" ADD CONSTRAINT "Installment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "finance"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi"."KpiItem" ADD CONSTRAINT "KpiItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "kpi"."KpiCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
