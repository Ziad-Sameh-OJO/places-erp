/**
 * M-09 field permissions on the clients (M-10) and the contracts (M-11) against the real API: a hidden field's value
 * never leaves the API (list, file, export, receipts), a search on it is dropped, and what the person may only read
 * can't be written. Its own role and person, so the seeded roles other test files use stay as they are.
 * Ahmed Islam = Super Admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E ${stamp} FCC`;
const KEY = `e2e-fcc-${stamp}`;
const PHONE = `0105${stamp.slice(-7)}`;
let admin: string, person: string, roleId: string, userId: string, clientId: string, unitId: string, dealId: string, deal2: string;
let contractId: string, installmentId: string, paymentId: string, pdf: string;

before(async () => {
  admin = await session("ahmed.islam@places.com");
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E fcc ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [
    { module: "clients", actions: ["view", "create", "edit", "export"] }, { module: "contracts", actions: ["view", "create", "edit"] },
  ] } } });
  roleId = role.id;
  const email = `fcc-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
  // an owner with a company, a number and a unit, and a contact logged on the file
  const c = await prisma.client.create({ data: { name: `${P} مالك`, company: `${P} Co`, kind: "owner", createdById: "e2e", lastContactAt: new Date(), phones: { create: [{ phone: PHONE }] } } });
  clientId = c.id;
  await prisma.clientInteraction.create({ data: { clientId, kind: "مكالمة", text: `${P} كلمناه`, byId: "e2e" } });
  const unit = await prisma.unit.create({ data: { code: `U-F${stamp}`, type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 120, condition: "Finished", pdfStatus: "confirmed", ownerId: clientId } });
  unitId = unit.id;
  const deal = async (n: number) => (await prisma.deal.create({ data: {
    code: `D-F${stamp}${n}`, unitId, type: "Rent", space: 120, location: P, company: `${P} شركة ${n}`, source: "Facebook",
    status: "APPROVED", commissionOwner: "50000", commissionClient: "0", closedAt: new Date(), createdById: "e2e",
  } })).id;
  dealId = await deal(1);
  deal2 = await deal(2);
  // a contract with one installment, part of it paid
  const k = await prisma.contract.create({ data: {
    code: `C-F${stamp}`, dealId, startsOn: new Date("2026-11-01"), endsOn: new Date("2027-10-31"), value: "120000", escalation: 10, createdById: "e2e",
    installments: { create: [{ dueOn: new Date("2026-11-01"), amount: "120000", paid: "30000" }] },
  }, include: { installments: true } });
  contractId = k.id; installmentId = k.installments[0]!.id;
  paymentId = (await prisma.installmentPayment.create({ data: { installmentId, amount: "30000", paidOn: new Date("2026-11-01"), createdById: "e2e" } })).id;
  pdf = (await prisma.file.create({ data: { key: `e2e/${stamp}-k.pdf`, name: `${P} k.pdf`, mime: "application/pdf", size: 100, status: "READY", uploadedById: userId } })).id;
  await prisma.contract.update({ where: { id: contractId }, data: { fileId: pdf } });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: roleId }, { userId }, { entityId: clientId }] } });
  await prisma.contract.deleteMany({ where: { dealId: { in: [dealId, deal2] } } });
  await prisma.file.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.deal.deleteMany({ where: { id: { in: [dealId, deal2] } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.clientInteraction.deleteMany({ where: { clientId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const fields = (module: string, rules: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module, rules } });
/** every file's text in a zip (the Excel export) */
function zipText(b: Buffer): string {
  const end = b.length - 22;
  let at = b.readUInt32LE(end + 16), text = "";
  for (let i = b.readUInt16LE(end + 10); i > 0; i--) {
    const len = b.readUInt16LE(at + 28), size = b.readUInt32LE(at + 20), local = b.readUInt32LE(at + 42);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
    text += (b.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8");
    at += 46 + len + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32);
  }
  return text;
}

test("the catalogs: a client's name and a contract's identity can't be hidden; a creator can't lose the contract's value", async () => {
  assert.equal((await fields("clients", { name: "hide" })).status, 400);
  assert.equal((await fields("contracts", { code: "read" })).status, 400);
  assert.equal((await fields("contracts", { value: "hide" })).status, 400); // the role uploads contracts
  assert.equal((await fields("clients", { phones: "hide", company: "hide", marketingConsent: "read", timeline: "hide" })).status, 204);
  assert.equal((await fields("inventory", { space: "hide" })).status, 204);
  assert.equal((await fields("contracts", { paid: "hide", file: "hide", escalation: "read" })).status, 400); // file is required too
  assert.equal((await fields("contracts", { paid: "hide", penalty: "hide", escalation: "read" })).status, 204);
});

test("clients: hidden fields are blank in the list, the file and the export; a search on them is dropped", async () => {
  const list = (await call(`/clients?q=${encodeURIComponent(P)}`, { cookie: person })).body as { items: Record<string, unknown>[] };
  const row = list.items.find((x) => x.id === clientId);
  assert.ok(row);
  assert.deepEqual([row.phones, row.company, row.name], [null, null, `${P} مالك`]);
  // by number or by company: nothing (it would tell them); the admin finds it both ways
  for (const q of [PHONE, `${P} Co`]) {
    const mine = (await call(`/clients?q=${encodeURIComponent(q)}`, { cookie: person })).body as { items: { id: string }[] };
    assert.ok(!mine.items.some((x) => x.id === clientId), q);
    const all = (await call(`/clients?q=${encodeURIComponent(q)}`, { cookie: admin })).body as { items: { id: string }[] };
    assert.ok(all.items.some((x) => x.id === clientId), q);
  }
  const file = (await call(`/clients/${clientId}`, { cookie: person })).body as { phones: unknown; company: unknown; units: { space: number; code: string }[]; timeline: { text: string }[] };
  assert.deepEqual([file.phones, file.company], [null, null]);
  // the history keeps the deals (their own field) but not the contacts logged
  assert.deepEqual(file.timeline.map((x) => x.text.startsWith("صفقة")), [true, true]);
  assert.deepEqual(file.units.map((u) => [u.code, u.space]), [[`U-F${stamp}`, 0]]); // the inventory's own rule
  const theirs = (await call(`/clients/${clientId}`, { cookie: admin })).body as { phones: string[]; units: { space: number }[] };
  assert.deepEqual([theirs.phones, theirs.units[0]!.space], [[PHONE], 120]);
  const xlsx = async (cookie: string) => zipText(Buffer.from(await (await fetch(`${API}/clients/export?q=${encodeURIComponent(P)}`, { headers: { cookie } })).arrayBuffer()));
  const out = await xlsx(person);
  assert.match(out, new RegExp(`${P} مالك`));
  assert.doesNotMatch(out, new RegExp(`${PHONE}|${P} Co|الأرقام`));
  assert.match(await xlsx(admin), new RegExp(PHONE));
});

test("clients: what the person may only read (or not see) can't be written", async () => {
  assert.equal((await call(`/clients/${clientId}/consent`, { method: "PUT", cookie: person, body: { consent: true } })).status, 403);
  assert.equal((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).marketingConsent, null);
  assert.equal((await call(`/clients/${clientId}/interactions`, { method: "POST", cookie: person, body: { kind: "مكالمة", text: "x" } })).status, 403);
  assert.equal((await call(`/clients/${clientId}/merges`, { method: "POST", cookie: person, body: { phone: PHONE } })).status, 403);
  // what isn't locked still works: the data deletion request
  assert.equal((await call(`/clients/${clientId}/deletion-request`, { method: "POST", cookie: person, body: { reason: `${P} عايز يمسح` } })).status, 204);
});

test("contracts: the payments are gone from the list, the drawer, the tiles and the receipts; they can't be recorded", async () => {
  const list = (await call(`/contracts?q=${encodeURIComponent(`C-F${stamp}`)}`, { cookie: person })).body as { items: Record<string, unknown>[] };
  const row = list.items.find((x) => x.id === contractId);
  assert.ok(row);
  assert.deepEqual([row.paid, row.value, row.escalation], ["", "120000.00", 10]);
  const d = (await call(`/contracts/${contractId}`, { cookie: person })).body as { installments: { paid: string; payments: unknown[]; amount: string }[]; file: unknown };
  assert.deepEqual([d.installments[0]!.amount, d.installments[0]!.paid, d.installments[0]!.payments], ["120000.00", "", []]);
  assert.ok(d.file, "the PDF is shown: not hidden for this role");
  const admins = (await call(`/contracts/${contractId}`, { cookie: admin })).body as { installments: { paid: string }[] };
  assert.equal(admins.installments[0]!.paid, "30000.00");
  assert.equal(((await call("/contracts/summary", { cookie: person })).body as { paid: string }).paid, "");
  const report = (await call("/contracts/collections?month=2026-11", { cookie: person })).body as { items: unknown[]; collected: string };
  assert.deepEqual([report.items, report.collected], [[], ""]);
  assert.equal((await call(`/contracts/payments/${paymentId}/receipt`, { cookie: person })).status, 403);
  assert.equal((await call(`/contracts/installments/${installmentId}/payments`, { method: "POST", cookie: person, body: { amount: "1000" } })).status, 403);
  assert.equal((await prisma.installment.findUniqueOrThrow({ where: { id: installmentId } })).paid.toFixed(2), "30000.00");
});

test("contracts: a new contract starts with what the person may not set empty; a hidden file can't be opened", async () => {
  const r = await call("/contracts", { method: "POST", cookie: person, body: { dealId: deal2, startsOn: "2026-11-01", endsOn: "2027-10-31", value: "60000", escalation: 15, fileId: pdf, schedule: { count: 2, everyMonths: 6 } } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const made = await prisma.contract.findFirstOrThrow({ where: { dealId: deal2 } });
  assert.deepEqual([made.value.toFixed(2), Number(made.escalation)], ["60000.00", 0]);
  assert.equal((await fields("contracts", { file: "hide" })).status, 400); // the role uploads: the PDF can't be hidden
  // the same rule for a role that doesn't upload: drop «create», then hide the PDF
  await prisma.rolePermission.updateMany({ where: { roleId, module: "contracts" }, data: { actions: ["view", "edit"] } });
  assert.equal((await fields("contracts", { file: "hide" })).status, 204);
  assert.equal(((await call(`/contracts/${contractId}`, { cookie: person })).body as { file: unknown }).file, null);
  assert.equal((await call(`/contracts/${contractId}/file`, { cookie: person })).status, 404);
});
