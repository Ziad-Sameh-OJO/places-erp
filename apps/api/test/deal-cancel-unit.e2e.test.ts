/**
 * 5.7 · M-02 2.3 (12): cancelling a deal releases its unit (2.9 `UnitsService.release`) in the cancel's transaction.
 * The lock is made on the built API's service (5.5 — the deal locking its unit — isn't wired yet) and Manar confirms it;
 * Nancy (Office Manager) cancels, Mohsen (sales) can't. A deal with no lock cancels as before.
 */
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

interface Units { lock(unitId: string, dealId: string, by: { type: string; userId: string }): Promise<{ status: string }> }
interface Ctx { get<T>(token: unknown): T; close(): Promise<void> }

const stamp = String(Date.now());
let manar: string, nancy: string, mohsen: string, manarId: string;
let ctx: Ctx, units: Units;
let unitId: string, locked: string, free: string;

before(async () => {
  [manar, nancy, mohsen] = await Promise.all(["manar.ahmed@places.com", "nancy.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  manarId = (await prisma.user.findUniqueOrThrow({ where: { email: "manar.ahmed@places.com" } })).id;
  const agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const core = await import("@nestjs/core");
  const app = await import("../dist/app.module.js" as string) as { AppModule: unknown };
  const svc = await import("../dist/modules/inventory/units.service.js" as string) as { UnitsService: unknown };
  ctx = await (core.NestFactory.createApplicationContext as (m: unknown, o: object) => Promise<Ctx>)(app.AppModule, { logger: false });
  units = ctx.get<Units>(svc.UnitsService);

  unitId = (await prisma.unit.create({ data: { code: `U-X${stamp}`, type: "Rent", project: `E2E ${stamp} إلغاء`, area: "التجمع الخامس", space: 120, condition: "Finished", pdfStatus: "confirmed", agentId } })).id;
  const deal = async (k: string) => (await prisma.deal.create({ data: {
    code: `D-X${stamp}${k}`, unitId, type: "Rent", status: "APPROVED", space: 120, location: "التجمع الخامس", company: `E2E ${stamp}`, source: "Facebook",
    commissionOwner: 0, commissionClient: 0, closedAt: new Date(), createdById: manarId,
  } })).id;
  locked = await deal("1");
  free = await deal("2");
});

after(async () => {
  await ctx?.close();
  await prisma.unitLock.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [unitId, locked, free] } } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-X${stamp}` } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.notification.deleteMany({ where: { text: { contains: `U-X${stamp}` } } });
  await prisma.$disconnect();
});

const cancel = (cookie: string, id: string) => call(`/deals/${id}/cancel`, { method: "POST", cookie, body: { reason: `E2E ${stamp} إلغاء` } });

test("cancelling a deal that closed its unit: sales can't; Nancy can, and the unit is available again", async () => {
  assert.deepEqual(await units.lock(unitId, locked, { type: "Rent", userId: manarId }), { status: "pending" });
  assert.equal((await call(`/inventory/units/${unitId}/locks/${locked}/confirm`, { method: "POST", cookie: manar })).status, 204);
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status, "rented");

  assert.equal((await cancel(mohsen, locked)).status, 403);
  assert.equal(await prisma.unitLock.count({ where: { unitId } }), 1, "a refused cancel leaves the lock");
  const r = await cancel(nancy, locked);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status, "available");
  assert.equal(await prisma.unitLock.count({ where: { unitId } }), 0);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "release", userId: (await prisma.user.findUniqueOrThrow({ where: { email: "nancy.islam@places.com" } })).id } }));
});

test("cancelling a deal with no lock on its unit works as before", async () => {
  const r = await cancel(nancy, free);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: free } })).status, "CANCELLED");
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status, "available");
});
