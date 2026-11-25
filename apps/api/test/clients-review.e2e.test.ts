/**
 * The clients review's fixes against the real API and database: a merge carries the client's 113 account (moved when
 * the kept file has none, its balance transferred when it has one), a «no» to marketing and the deletion request; the
 * Sales Director's «ادمج بالموبايل» doesn't tell whether a number is an owner's; «ابديت مع المالك» moves the units'
 * last update only for whoever keeps the inventory. Randa is Resale (inventory and files), Heba Operations (approves
 * merges), Ahmed Ashraf collects, Mohamed Mohsen is a salesperson; the Sales Director is made here (none is seeded).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { PW, call, mark, session } from "./helpers.ts";
import { balance, cents, cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const P = `E2E-CRV ${stamp}`;
const since = new Date();
const phone = (n: number) => `0157${stamp.slice(-6)}${n}`; // own prefix: other files use 010 / 011 / 012 / 0158
let randa: string, heba: string, ashraf: string, mohsen: string, director: string, directorUser: string, buyerUser: string, buyerId: string;
let bankId: string, revenueId: string, unitId: string;
const files: Record<string, string> = {};
const leadIds: string[] = [], dealIds: string[] = [];

const file = (key: string, kind: "client" | "owner" | "both", n: number, extra: object = {}) =>
  prisma.client.create({ data: { name: `${P} ${key}`, kind, phones: { create: [{ phone: phone(n) }] }, ...extra } }).then((c) => (files[key] = c.id));

/** An approved deal on a lead of `fileKey`, with 4,000 of its 10,000 collected from the client: the file's 113 owes 6,000. */
async function collectedDeal(fileKey: string, n: number) {
  const lead = await prisma.lead.create({ data: { code: `L-CR${n}${stamp}`, name: `${P} عميل ${n}`, phones: [phone(n)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", createdById: "e2e", clientId: files[fileKey]! } });
  leadIds.push(lead.id);
  const d = await prisma.deal.create({ data: {
    code: `D-CR${n}${stamp}`, leadId: lead.id, unitId, type: "Rent", space: 90, location: `${P} مشروع`, company: `${P} شركة ${n}`, source: "Facebook", status: "APPROVED",
    commissionOwner: "0", commissionClient: "10000", closedAt: new Date(), createdById: "e2e", participants: { create: [{ employeeId: buyerId, side: "BUYER" }] },
  } });
  dealIds.push(d.id);
  mark(d.id, `D-CR${n}${stamp}`);
  const r = await call(`/deals/${d.id}/collections`, { method: "POST", cookie: ashraf, body: { side: "client", toId: bankId, amount: "4000", revenueId } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
}
const account = (key: string) => prisma.account.findUnique({ where: { partyType_partyId: { partyType: "client", partyId: files[key]! } } });

before(async () => {
  [randa, heba, ashraf, mohsen] = await Promise.all(["randa.mohamed@places.com", "heba.salah@places.com", "ahmed.ashraf@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const dirEmail = `e2e-crv-dir-${stamp}@example-deal.test`, buyerEmail = `e2e-crv-buyer-${stamp}@example-deal.test`; // not @places.test: access.e2e removes those
  directorUser = (await prisma.user.create({ data: { email: dirEmail, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { primary: true, role: { connect: { key: "salesdir" } } } },
    employee: { create: { name: `${P} Sales Director`, jobTitle: "Sales Director", department: "Sales", salary: 0, target: 0, commissionPct: 0 } } } })).id;
  director = await session(dirEmail);
  const b = await prisma.user.create({ data: { email: buyerEmail, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { primary: true, role: { connect: { key: "sales" } } } },
    employee: { create: { name: `${P} Buyer`, jobTitle: "Sales", department: "Sales", salary: 0, target: 0, commissionPct: 0 } } }, include: { employee: true } });
  buyerUser = b.id; buyerId = b.employee!.id;
  bankId = (await fresh(ashraf, P, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, P, "41", "عمولات")).id;
  unitId = (await prisma.unit.create({ data: { code: `U-CR${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 90, condition: "Finished" } })).id;
  // A ← B: B has the account and the data-protection flags, A neither · C ← D: both have an account
  await file("A", "client", 1, { marketingConsent: true });
  await file("B", "client", 2, { marketingConsent: false, deletionAskedAt: new Date("2026-11-01T10:00:00Z"), deletionAskedBy: "e2e", deletionReason: `${P} امسحوا بياناتي` });
  await file("C", "client", 3);
  await file("D", "client", 4);
  await file("O", "both", 5); // an owner who is also Mohsen's client
  await file("X", "client", 6); // the director's file
  await collectedDeal("B", 2);
  await collectedDeal("C", 3);
  await collectedDeal("D", 4);
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  leadIds.push((await prisma.lead.create({ data: { code: `L-CRO${stamp}`, name: `${P} O`, phones: [phone(5)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId: emp.id, createdById: "e2e", clientId: files.O! } })).id);
  await prisma.unit.update({ where: { id: unitId }, data: { ownerId: files.O!, lastOwnerUpdateAt: new Date(Date.now() - 50 * 86_400_000) } });
});

after(async () => {
  const ids = Object.values(files);
  const tcrs = (await prisma.tcr.findMany({ where: { dealId: { in: dealIds } }, select: { id: true } })).map((t) => t.id);
  const merges = (await prisma.clientMerge.findMany({ where: { OR: [{ keepId: { in: ids } }, { dropId: { in: ids } }] }, select: { id: true } })).map((m) => m.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...leadIds, ...dealIds, ...tcrs, ...merges, unitId] } } });
  await prisma.tcr.deleteMany({ where: { dealId: { in: dealIds } } });
  await prisma.payment.deleteMany({ where: { dealId: { in: dealIds } } });
  await cleanFinance(P, since);
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  await prisma.clientMerge.deleteMany({ where: { id: { in: merges } } });
  await prisma.clientInteraction.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { OR: [{ text: { contains: P } }, { userId: { in: [directorUser, buyerUser] } }] } });
  await prisma.session.deleteMany({ where: { userId: { in: [directorUser, buyerUser] } } });
  await prisma.employee.deleteMany({ where: { userId: { in: [directorUser, buyerUser] } } });
  await prisma.user.deleteMany({ where: { id: { in: [directorUser, buyerUser] } } });
  await prisma.$disconnect();
});

const merge = async (keep: string, drop: string) => {
  const m = await prisma.clientMerge.create({ data: { keepId: files[keep]!, dropId: files[drop]!, reason: `${P} نفس الشخص` } });
  const r = await call(`/clients/merges/${m.id}`, { method: "POST", cookie: heba, body: { decision: "approve" } });
  assert.equal(r.status, 204, JSON.stringify(r.body));
  return m.id;
};

test("9.12 · M-10 2.2: the kept file without an account takes the dropped file's 113, balance and all; audited", async () => {
  const b = await account("B");
  assert.ok(b);
  assert.equal(await balance(ashraf, b.id), cents("6000"));
  await merge("A", "B");
  const a = await account("A");
  assert.equal(a?.id, b.id); // the same receivable, now the kept file's
  assert.equal(await balance(ashraf, a.id), cents("6000"));
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "finance", entity: "Account", entityId: b.id, action: "update" } }));
  // the next collection on that deal settles the same account (the lead is on A now)
  assert.equal((await call(`/deals/${dealIds[0]}/collections`, { method: "POST", cookie: ashraf, body: { side: "client", toId: bankId, amount: "1000" } })).status, 201);
  assert.equal(await balance(ashraf, a.id), cents("5000"));
});

test("M-10 3.1 · 2.3: the kept file keeps the dropped file's «no» to marketing and its deletion request", async () => {
  const kept = await prisma.client.findUniqueOrThrow({ where: { id: files.A! } });
  assert.equal(kept.marketingConsent, false);
  assert.equal(kept.deletionReason, `${P} امسحوا بياناتي`);
  assert.equal(kept.deletionAskedAt?.toISOString(), "2026-11-01T10:00:00.000Z");
});

test("9.12 · M-10 2.2: both files with an account → the dropped one's balance moves to the kept one in one entry", async () => {
  const [c, d] = [await account("C"), await account("D")];
  assert.ok(c && d);
  await merge("C", "D");
  assert.equal(await balance(ashraf, c.id), cents("12000"));
  assert.equal(await balance(ashraf, d.id), 0);
  const entry = await prisma.journalEntry.findFirstOrThrow({ where: { source: "client-merge" , lines: { some: { accountId: d.id } } }, include: { lines: true } });
  assert.equal(entry.lines.reduce((s, l) => s + cents(l.debit.toFixed(2)) - cents(l.credit.toFixed(2)), 0), 0);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Client", entityId: files.C!, action: "merge" } });
  assert.equal((log.after as { ledger: { account: string } }).ledger.account, c.code);
});

test("M-10 4.1: the Sales Director's «ادمج بالموبايل» answers an owner's number like an unknown one; Randa (inventory) finds it", async () => {
  const suggest = (cookie: string, p: string) => call(`/clients/${files.X}/merges`, { method: "POST", cookie, body: { phone: p } });
  const owner = await suggest(director, phone(5)), nobody = await suggest(director, "01234567890");
  assert.deepEqual([owner.status, owner.body], [nobody.status, nobody.body]);
  assert.equal(await prisma.clientMerge.count({ where: { keepId: files.X!, dropId: files.O! } }), 0);
  const r = await suggest(randa, phone(5));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await prisma.clientMerge.update({ where: { id: r.body.id }, data: { status: "rejected" } });
});

test("M-10 1.2 · 2.4: «ابديت مع المالك» from sales is only logged; the units' last update is the inventory's", async () => {
  const last = async () => (await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).lastOwnerUpdateAt.getTime();
  const old = await last();
  const log = (cookie: string) => call(`/clients/${files.O}/interactions`, { method: "POST", cookie, body: { kind: "ابديت مع المالك", text: `${P} لسه متاحة` } });
  assert.equal((await log(mohsen)).status, 201);
  assert.equal(await last(), old);
  assert.equal((await log(randa)).status, 201);
  assert.ok((await last()) > old);
});
