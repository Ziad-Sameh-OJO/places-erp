/**
 * M-09 field permissions on the accounts (M-07) and purchase requests (M-08) against the real API. A role that records
 * vouchers can't lose «المبلغ» (a voucher needs it) but can lose the memo and the party; a view-only role can lose
 * «المبلغ», and then every balance, total and budget figure goes blank with it (a sum would tell the amounts). A
 * filter on a hidden field is dropped, a save keeps what the person may not change, a create starts it empty.
 * Own roles and people, so the seeded roles other files use stay as they are. Ahmed Ashraf = accountant, Mokhtar = procurement.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";
import { cleanFinance, fresh, runPrefix } from "./finance-helpers.ts";

const START = new Date();
const P = runPrefix("fields-fin");
const stamp = START.getTime();
const KEYS = { clerk: `e2e-fields-clerk-${stamp}`, viewer: `e2e-fields-viewer-${stamp}` };
let admin: string, ahmed: string, mokhtar: string, clerk: string, viewer: string;
const roleIds: string[] = [], userIds: string[] = [], purchases: string[] = [];
let safe: { id: string }, safe2: { id: string }, line: { id: string };

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [admin, ahmed, mokhtar] = await Promise.all([adminEmail, "ahmed.ashraf@places.com", "mokhtar.gamal@places.com"].map((e) => session(e)));
  const person = async (key: string, permissions: { module: string; actions: string[] }[]) => {
    const role = await prisma.role.create({ data: { key, label: `E2E ${key}`, tier: "Executive Staff", scope: "ALL", permissions: { create: permissions } } });
    roleIds.push(role.id);
    const email = `${key}@places.test`;
    const u = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId: role.id, primary: true }] } } });
    userIds.push(u.id);
    return session(email);
  };
  clerk = await person(KEYS.clerk, [{ module: "finance", actions: ["view", "create", "edit", "approve", "export"] }, { module: "procurement", actions: ["view", "create", "edit", "export"] }]);
  viewer = await person(KEYS.viewer, [{ module: "finance", actions: ["view", "export"] }, { module: "procurement", actions: ["view", "export"] }]);
  safe = await fresh(ahmed, P, "111", "خزينة", "50000");
  safe2 = await fresh(ahmed, P, "111", "خزينة تانية");
  line = await fresh(ahmed, P, "52", "بوفيه");
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...roleIds, ...purchases] } }, { userId: { in: userIds } }] } });
  await prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
  await cleanFinance(P, START);
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.$disconnect();
});

const fields = (key: string, body: object) => call(`/access/roles/${key}/fields`, { method: "PUT", cookie: admin, body });
/** The text inside an .xlsx (a zip): its shared strings carry the headers. */
async function xlsxText(path: string, cookie: string): Promise<string> {
  const res = await fetch(API + path, { headers: { cookie } });
  assert.equal(res.status, 200, path);
  const b = Buffer.from(await res.arrayBuffer());
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

test("the admin sets the fields; the account and date stay; the amount can't be hidden from a role that records it", async () => {
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { account: "hide" } })).status, 400);
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { date: "read" } })).status, 400);
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { amount: "hide" } })).status, 400);
  assert.equal((await fields(KEYS.clerk, { module: "procurement", rules: { item: "hide" } })).status, 400);
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { memo: "hide" } })).status, 400); // a voucher needs its memo
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { memo: "read", ref: "read" } })).status, 204);
  assert.equal((await fields(KEYS.viewer, { module: "finance", rules: { amount: "hide", memo: "hide", party: "hide" } })).status, 204);
});

test("finance: a hidden memo / party never leaves the API, its search is dropped; a create starts them empty", async () => {
  const memo = `${P} بيان سري`;
  const r = await call("/finance/moves", { method: "POST", cookie: ahmed, body: { kind: "pay", fromId: safe.id, accountId: line.id, amount: "1000", party: `${P} مورد`, ref: "INV-9", memo } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.move.id as string, entryId = r.body.move.entry.id as string;
  const mv = (await call(`/finance/moves/${id}`, { cookie: viewer })).body;
  assert.deepEqual([mv.memo, mv.party, mv.ref, mv.amount, mv.no], ["", "", "INV-9", "", r.body.move.no]);
  assert.deepEqual([(await call(`/finance/moves/${id}`, { cookie: clerk })).body.memo], [memo]); // read only: shown
  const listed = ((await call(`/finance/moves?accountId=${safe.id}`, { cookie: viewer })).body.items as { id: string; memo: string; party: string }[]).find((x) => x.id === id)!;
  assert.deepEqual([listed.memo, listed.party], ["", ""]);
  assert.equal((await call(`/finance/journal/${entryId}`, { cookie: viewer })).body.memo, "");
  // the search on the memo: Ahmed finds one entry, for the viewer it's dropped (it would tell what the memo says)
  const q = encodeURIComponent(memo);
  assert.equal((await call(`/finance/journal?q=${q}`, { cookie: ahmed })).body.total, 1);
  const all = (await call("/finance/journal", { cookie: viewer })).body.total as number;
  assert.ok(all > 1);
  assert.equal((await call(`/finance/journal?q=${q}`, { cookie: viewer })).body.total, all);
  // the clerk's own transfer: the memo and reference they may not set are saved empty
  const t = await call("/finance/moves", { method: "POST", cookie: clerk, body: { kind: "transfer", fromId: safe.id, toId: safe2.id, amount: "500", ref: "X-1", memo: `${P} تحويل` } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const saved = await prisma.treasuryMove.findUniqueOrThrow({ where: { id: t.body.move.id } });
  assert.deepEqual([saved.memo, saved.ref, saved.amount.toFixed(2)], ["", null, "500.00"]);
});

test("finance: a read-only amount can't be entered, and an edit keeps the entry's lines and memo", async () => {
  const lines = [{ accountId: line.id, debit: "300", credit: "0" }, { accountId: safe.id, debit: "0", credit: "300" }];
  const m = await call("/finance/journal", { method: "POST", cookie: ahmed, body: { date: "2026-11-02", memo: `${P} قيد`, lines } });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal((await fields(KEYS.clerk, { module: "finance", rules: { amount: "read", memo: "read", ref: "read" } })).status, 204);
  const no = await call("/finance/moves", { method: "POST", cookie: clerk, body: { kind: "pay", fromId: safe.id, accountId: line.id, amount: "10", party: "x", memo: `${P} صرف` } });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /قراية بس/);
  const edit = await call(`/finance/journal/${m.body.entry.id}`, { method: "PUT", cookie: clerk, body: { date: "2026-11-03", memo: "غيّرته", lines: lines.map((l) => ({ ...l, debit: l.debit === "0" ? "0" : "999", credit: l.credit === "0" ? "0" : "999" })) } });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const e = await prisma.journalEntry.findUniqueOrThrow({ where: { id: m.body.entry.id }, include: { lines: true } });
  assert.equal(e.memo, `${P} قيد`);
  assert.deepEqual(e.lines.map((l) => l.debit.toFixed(2)).sort(), ["0.00", "300.00"]);
  assert.equal(e.date.toISOString().slice(0, 10), "2026-11-03");
});

test("finance: a hidden amount blanks every balance, line and total, and leaves the budget export without its money columns", async () => {
  const cash = (await call("/finance/cash", { cookie: viewer })).body;
  assert.ok(cash.accounts.length && cash.accounts.every((a: { balance: string; name: string }) => a.balance === "" && a.name));
  assert.deepEqual([cash.today.paid, cash.today.received], ["", ""]);
  const chart = (await call("/finance/accounts", { cookie: viewer })).body;
  assert.deepEqual([chart.roots[0].balance, chart.check.assets], ["", ""]);
  const journal = (await call("/finance/journal", { cookie: viewer })).body;
  assert.deepEqual([journal.totals.debit, journal.items[0].lines[0].debit, journal.items[0].debit], ["", "", ""]);
  assert.ok(journal.items[0].lines[0].name, "the account stays");
  const moves = (await call(`/finance/moves?accountId=${safe.id}`, { cookie: viewer })).body.items;
  assert.ok(moves.length && moves.every((x: { amount: string }) => x.amount === ""));
  const ledger = (await call(`/finance/accounts/${safe.id}/ledger`, { cookie: viewer })).body;
  assert.deepEqual([ledger.balance, ledger.lines[0].balance], ["", ""]);
  const budget = (await call("/finance/budget", { cookie: viewer })).body;
  assert.deepEqual([budget.totals.spent, budget.rows.find((r: { accountId: string }) => r.accountId === line.id).spent], ["", ""]);
  const income = (await call("/finance/statements/income", { cookie: viewer })).body;
  assert.deepEqual([income.net, income.revenue], ["", ""]);
  assert.match(await xlsxText("/finance/budget/export", ahmed), /اتصرف/);
  assert.doesNotMatch(await xlsxText("/finance/budget/export", viewer), /اتصرف/);
  // the claim and its receipt are the amount: not printed for whom it's hidden
  assert.equal((await call(`/claims/${crypto.randomUUID()}/pdf`, { cookie: viewer })).status, 403);
  // Ahmed still sees everything
  assert.notEqual((await call("/finance/cash", { cookie: ahmed })).body.accounts[0].balance, "");
});

test("procurement: a hidden vendor / amount never leaves the API, the vendor filter is dropped; a read-only vendor starts empty", async () => {
  const r = await call("/procurement/purchases", { method: "POST", cookie: mokhtar, body: { item: `${P} طلب`, amount: "750", accountId: line.id, vendor: `${P} مورد` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  purchases.push(r.body.id);
  assert.equal((await fields(KEYS.clerk, { module: "procurement", rules: { amount: "hide" } })).status, 400); // the clerk creates requests
  assert.equal((await fields(KEYS.clerk, { module: "procurement", rules: { vendor: "read" } })).status, 204);
  assert.equal((await fields(KEYS.viewer, { module: "procurement", rules: { amount: "hide", vendor: "hide" } })).status, 204);
  const mine = await call("/procurement/purchases", { method: "POST", cookie: clerk, body: { item: `${P} طلبي`, amount: "200", accountId: line.id, vendor: "مورد ممنوع" } });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  purchases.push(mine.body.id);
  assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: mine.body.id } })).vendor, null);
  const one = (await call(`/procurement/purchases/${r.body.id}`, { cookie: viewer })).body;
  assert.deepEqual([one.amount, one.vendor, one.item], ["", "", `${P} طلب`]);
  const vendor = encodeURIComponent(`${P} مورد`);
  assert.equal((await call(`/procurement/purchases?vendor=${vendor}`, { cookie: mokhtar })).body.total, 1);
  const all = (await call("/procurement/purchases", { cookie: viewer })).body.total as number;
  assert.ok(all >= 2);
  assert.equal((await call(`/procurement/purchases?vendor=${vendor}`, { cookie: viewer })).body.total, all);
  const ov = (await call("/procurement/overview", { cookie: viewer })).body;
  assert.ok(ov.lines.every((l: { spent: string }) => l.spent === ""));
  assert.match(await xlsxText("/procurement/purchases/export", clerk), /المورد/); // read only: in the file
  const text = await xlsxText("/procurement/purchases/export", viewer);
  assert.doesNotMatch(text, /المورد|المبلغ/);
  assert.match(text, /الحاجة/);
});
