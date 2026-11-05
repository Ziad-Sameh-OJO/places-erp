/**
 * 2.9 · closing a unit after a Done Deal (M-03 Q16, Q17) against the real database: `UnitsService.lock / release` are
 * what the deals (5.5) and contracts (6.4) call, so they're called here on the built API's service; the confirm is
 * Manar's (Rent) or Randa's (Resale / Income) over HTTP. U-103 from the demo: Rent and Resale at once.
 * Manar = inventory, Randa = resale, Mohamed Mohsen = sales.
 */
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

interface Units {
  lock(unitId: string, dealId: string, by: { type: string; userId: string }): Promise<{ status: string }>;
  release(unitId: string, dealId: string, by: { userId: string }): Promise<void>;
}
interface Ctx { get<T>(token: unknown): T; close(): Promise<void> }

const stamp = String(Date.now());
const P = `E2E ${stamp} قفل`;
let manar: string, randa: string, sales: string, manarId: string, randaId: string, agentId: string;
let ctx: Ctx, units: Units;
let unitId: string, code: string;
const deals: Record<"rent" | "rent2" | "resale", string> = { rent: "", rent2: "", resale: "" };

before(async () => {
  [manar, randa, sales] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  [manarId, randaId] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com"].map(async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id));
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  // the service as the deals module gets it: from the built API (CI and the local e2e build it first)
  const core = await import("@nestjs/core");
  const app = await import("../dist/app.module.js" as string) as { AppModule: unknown };
  const svc = await import("../dist/modules/inventory/units.service.js" as string) as { UnitsService: unknown };
  ctx = await (core.NestFactory.createApplicationContext as (m: unknown, o: object) => Promise<Ctx>)(app.AppModule, { logger: false });
  units = ctx.get<Units>(svc.UnitsService);

  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: {
    type: "Rent", alsoType: "Resale", project: `${P} The Waterway`, area: "التجمع الخامس", space: 150, condition: "متشطب", floor: "1", building: "W2",
    parking: 2, agentId, ownerName: "م. هاني", ownerPhone: "01000000103", pricePerSqm: "900",
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ({ id: unitId, code } = r.body as { id: string; code: string });
  await prisma.unit.update({ where: { id: unitId }, data: { pdfStatus: "confirmed" } });
  const deal = (k: string, type: string) => prisma.deal.create({ data: {
    code: `D-L${stamp}${k}`, unitId, type, space: 150, location: "التجمع الخامس", company: `E2E ${stamp}`, source: "Facebook", commissionOwner: 0, commissionClient: 0, closedAt: new Date(), createdById: manarId,
  } });
  deals.rent = (await deal("1", "Rent")).id;
  deals.rent2 = (await deal("2", "Rent")).id;
  deals.resale = (await deal("3", "Resale")).id;
});

after(async () => {
  await ctx?.close();
  await prisma.unitLock.deleteMany({ where: { unitId } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-L${stamp}` } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.notification.deleteMany({ where: { text: { contains: code } } });
  await prisma.$disconnect();
});

const unit = async (cookie: string) => {
  const r = await call(`/inventory/units/${unitId}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { status: string; alsoType: string | null; alsoStatus: string | null; locks: Array<{ dealId: string; type: string; status: string; canConfirm: boolean; lockedAt: string | null }> };
};
const confirm = (cookie: string, dealId: string) => call(`/inventory/units/${unitId}/locks/${dealId}/confirm`, { method: "POST", cookie });
const status = (n: number) => (e: unknown) => (e as { getStatus?: () => number }).getStatus?.() === n;
const codesIn = async (query: string) => ((await call(`/inventory/units?q=${encodeURIComponent(P)}${query}`, { cookie: manar })).body as { items: Array<{ code: string }> }).items.map((u) => u.code);

test("a unit can be Rent and Resale at once (Q17): the form's second type, never the same as its type", async () => {
  const u = await unit(manar);
  assert.equal(u.alsoType, "Resale");
  assert.equal(u.alsoStatus, "available");
  const same = await call("/inventory/units", { method: "POST", cookie: manar, body: {
    type: "Rent", alsoType: "Rent", project: `${P} The Waterway`, area: "التجمع الخامس", space: 150, condition: "متشطب", building: "W2",
    agentId, ownerName: "م. هاني", ownerPhone: "01000000103", pricePerSqm: "900",
  } });
  assert.equal(same.status, 400);
  assert.match(JSON.stringify(same.body), /النوع التاني لازم يبقى غير الـ Type/);
  assert.ok(await codesIn("&type=Resale").then((c) => c.includes(code)), "listed under Resale too");
});

test("Done Deal → lock asks Manar (Rent) to confirm; the unit stays open until she does", async () => {
  assert.deepEqual(await units.lock(unitId, deals.rent, { type: "Rent", userId: manarId }), { status: "pending" });
  // the same deal again changes nothing
  assert.deepEqual(await units.lock(unitId, deals.rent, { type: "Rent", userId: manarId }), { status: "pending" });
  const u = await unit(manar);
  assert.equal(u.status, "available");
  assert.deepEqual(u.locks.map((l) => [l.dealId, l.type, l.status, l.canConfirm]), [[deals.rent, "Rent", "pending", true]]);
  assert.equal((await unit(randa)).locks[0]!.canConfirm, false, "the Rent close is Manar's");
  const told = await prisma.notification.findMany({ where: { text: { contains: code } }, select: { userId: true } });
  assert.ok(told.some((n) => n.userId === manarId), "Manar is told");
  assert.ok(!told.some((n) => n.userId === randaId), "Randa isn't told of a Rent close");
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "close-request" } });
  assert.ok(audit, "the request is audited");
});

test("a second deal on the same side, a type the unit isn't, or an unknown unit are refused", async () => {
  await assert.rejects(units.lock(unitId, deals.rent2, { type: "Rent", userId: manarId }), status(409));
  await assert.rejects(units.lock(unitId, deals.rent2, { type: "Income", userId: manarId }), status(400));
  await assert.rejects(units.lock("nope", deals.rent2, { type: "Rent", userId: manarId }), status(404));
});

test("only Manar confirms the Rent close (Q16): Randa 403, sales 403; then the Rent side is Rented, Resale still open (Q17)", async () => {
  assert.equal((await confirm(randa, deals.rent)).status, 403);
  assert.equal((await confirm(sales, deals.rent)).status, 403);
  assert.equal((await confirm(manar, deals.rent)).status, 204);
  const u = await unit(manar);
  assert.equal(u.status, "rented");
  assert.equal(u.alsoStatus, "available");
  assert.ok(u.locks[0]!.lockedAt);
  assert.equal((await confirm(manar, deals.rent)).status, 400, "confirmed once");
  assert.ok((await codesIn("&view=closed")).includes(code), "on the rented / sold sheet");
  assert.ok((await codesIn("&type=Resale")).includes(code), "still offered as Resale");
  assert.ok(!(await codesIn("&type=Rent")).includes(code), "no longer offered as Rent");
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "close" } });
  assert.deepEqual(audit?.after, { dealId: deals.rent, type: "Rent", status: "rented" });
  // a closed side takes no new deal
  await assert.rejects(units.lock(unitId, deals.rent2, { type: "Rent", userId: manarId }), status(400));
});

test("the Resale side: Randa confirms (Manar can't), and it's Sold", async () => {
  assert.deepEqual(await units.lock(unitId, deals.resale, { type: "Resale", userId: manarId }), { status: "pending" });
  assert.ok((await prisma.notification.findMany({ where: { userId: randaId, text: { contains: code } } })).length, "Randa is told");
  assert.equal((await confirm(manar, deals.resale)).status, 403);
  assert.equal((await confirm(randa, deals.resale)).status, 204);
  const u = await unit(randa);
  assert.equal(u.status, "rented");
  assert.equal(u.alsoStatus, "sold");
});

test("a side with a Done Deal can't be edited off the unit; the deals stay hidden from sales", async () => {
  const body = {
    type: "Rent", project: `${P} The Waterway`, area: "التجمع الخامس", space: 150, condition: "متشطب", floor: "1", building: "W2",
    parking: 2, agentId, ownerName: "م. هاني", ownerPhone: "01000000103", pricePerSqm: "900",
  };
  const r = await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: manar, body });
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.body), /Done Deal D-L\d+3/);
  assert.deepEqual((await unit(sales)).locks, []);
});

test("release (deal cancelled / contract ended, 6.4): the side is open again and takes a new deal", async () => {
  await units.release(unitId, deals.rent, { userId: manarId });
  await units.release(unitId, deals.rent, { userId: manarId }); // nothing left: no-op
  let u = await unit(manar);
  assert.equal(u.status, "available");
  assert.equal(u.alsoStatus, "sold");
  assert.deepEqual(u.locks.map((l) => l.dealId), [deals.resale]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "release" } }));
  assert.deepEqual(await units.lock(unitId, deals.rent2, { type: "Rent", userId: manarId }), { status: "pending" });
  // releasing a request that was never confirmed leaves the side as it was
  await units.release(unitId, deals.rent2, { userId: manarId });
  await units.release(unitId, deals.resale, { userId: manarId });
  u = await unit(manar);
  assert.equal(u.status, "available");
  assert.equal(u.alsoStatus, "available");
  assert.deepEqual(u.locks, []);
});
