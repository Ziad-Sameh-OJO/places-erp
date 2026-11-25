/**
 * M-12 · the KPI item «التارجت» from the daily job: the quarter's collections against the quarter's three monthly
 * targets, as the targets page reads them — a deal closed in September and collected in October counts, and a month's
 * own target replaces the standing one. A throwaway salesperson, card and deal; everything is removed in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { kpiQuarterLock } from "./helpers.ts";

const stamp = Date.now();
const EMAIL = `e2e-kpi-target-${stamp}@example-deal.test`;
let empId = "", itemId = "";

before(async () => {
  const q = await prisma.kpiQuarter.findFirstOrThrow({ where: { status: "open" }, orderBy: { id: "desc" } });
  const [y, n] = q.id.split("-Q").map(Number) as [number, number];
  const m = (k: number) => `${y}-${String((n - 1) * 3 + k).padStart(2, "0")}`; // the quarter's k-th month
  const user = await prisma.user.create({ data: { email: EMAIL, status: "ACTIVE", passwordHash: "-", roles: { create: { primary: true, role: { connect: { key: "sales" } } } },
    employee: { create: { name: `E2E-KT ${stamp}`, jobTitle: "Sales", department: "Sales", salary: 0, target: 1_000_000, commissionPct: 0 } } }, include: { employee: true } });
  empId = user.employee!.id;
  // the third month's own target is 2M: the quarter's goal is 1M + 1M + 2M = 4M
  await prisma.salesTarget.create({ data: { employeeId: empId, month: m(3), value: 2_000_000 } });
  const card = await prisma.kpiCard.create({ data: { quarter: q.id, employeeId: empId, items: { create: [{ position: 0, title: "E2E target", weight: 100, targetText: "", method: "system", goal: 100, metric: "ownTarget" }] } }, include: { items: true } });
  itemId = card.items[0]!.id;
  const unit = await prisma.unit.create({ data: { code: `U-KT${stamp}`, type: "Rent", project: "E2E-KT", area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed" } });
  const account = await prisma.account.findFirstOrThrow();
  // closed the day before the quarter, 3M collected in its first month: half (1.5M) is the Buyer's share
  await prisma.deal.create({ data: {
    code: `D-KT${stamp}`, unitId: unit.id, type: "Rent", space: 300, location: "E2E-KT", company: "E2E-KT", source: "Facebook", status: "FULLY_COLLECTED",
    commissionOwner: "3000000", commissionClient: "0", closedAt: new Date(Date.parse(`${m(1)}-01T00:00:00Z`) - 86_400_000), createdById: "e2e",
    participants: { create: [{ employeeId: empId, side: "BUYER" }] },
    payments: { create: [{ side: "owner", amount: "3000000", receivedAt: new Date(`${m(1)}-10T10:00:00Z`), accountId: account.id, recordedById: "e2e" }] },
  } });
});

after(async () => {
  const deals = (await prisma.deal.findMany({ where: { code: `D-KT${stamp}` }, select: { id: true } })).map((d) => d.id);
  await prisma.payment.deleteMany({ where: { dealId: { in: deals } } });
  await prisma.dealParticipant.deleteMany({ where: { dealId: { in: deals } } });
  await prisma.deal.deleteMany({ where: { id: { in: deals } } });
  await prisma.unit.deleteMany({ where: { code: `U-KT${stamp}` } });
  if (empId) {
    await prisma.kpiCard.deleteMany({ where: { employeeId: empId } });
    await prisma.salesTarget.deleteMany({ where: { employeeId: empId } });
  }
  await prisma.auditLog.deleteMany({ where: { module: "kpis", entity: "KpiItem", entityId: itemId || "-" } });
  const users = (await prisma.user.findMany({ where: { email: EMAIL }, select: { id: true } })).map((u) => u.id);
  await prisma.employee.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test("M-12 · «التارجت»: 1.5M collected this quarter against 4M of monthly targets = 37.5%", () => kpiQuarterLock(async () => {
  let t = new Date();
  while (!isWorkingDay(localDate(t))) t = new Date(t.getTime() + 24 * 3600_000); // the job rests on days off
  await kpiRefreshTick(t, [empId]);
  const it = await prisma.kpiItem.findUniqueOrThrow({ where: { id: itemId } });
  assert.equal(Number(it.value), 37.5);
}));
