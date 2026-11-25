/**
 * The deals review's fixes against the real API and database: the Office Manager's review and the collections run
 * under the deal's lock (an approve and a reject at once, or a double «سجّل تحصيل», can't both apply); each side is
 * collected up to its own commission, dated between the close day and today; a corrected TCR is signed again;
 * Manar approves a Seller on a live deal only; «deal.approved» and the client's file follow the deals field rules
 * (M-09) and the deal scope; a cancelled deal's TCRs leave «مهامي النهارده»; the sheet returns one deal by id.
 * People of our own (no TL, so no shared balance moves): A closes the deal; «blind» is a Buyer whose role hides the
 * commissions; Nancy (Office Manager) reviews; Ahmed Ashraf collects; Manar approves the Seller.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { hash } from "@node-rs/argon2";
import { localDate } from "@places/domain";
import { PW, call, mark, session } from "./helpers.ts";
import { cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-GRD ${stamp}`;
const KEY = `e2e-deal-blind-${stamp}`;
const since = new Date();
type Key = "a" | "other" | "seller" | "blind";
const people = {} as Record<Key, { userId: string; id: string; cookie: string }>;
let nancy: string, ashraf: string, manar: string, roleId: string;
let leadId: string, unitId: string, raceUnitId: string, dealId: string, raceId: string, deadId: string, otherDealId: string, bankId: string, revenueId: string;

async function person(key: Key, role: string) {
  const email = `e2e-grd-${key}-${stamp}@example-deal.test`; // not @places.test: access.e2e removes those at its end
  const u = await prisma.user.create({
    data: {
      email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { primary: true, role: { connect: { key: role } } } },
      employee: { create: { name: `${C} ${key}`, jobTitle: "Sales", department: "Sales", salary: 0, target: 1_000_000, commissionPct: 30 } },
    },
    include: { employee: true },
  });
  people[key] = { userId: u.id, id: u.employee!.id, cookie: await session(email) };
}

const deal = (code: string, status: "PENDING_REVIEW" | "CANCELLED", unit: string, buyer: string, extra: object = {}) => prisma.deal.create({ data: {
  code, unitId: unit, type: "Rent", space: 100, location: `${C} مشروع`, company: `${C} شركة ${code}`, source: "Facebook", status,
  commissionOwner: "10000", commissionClient: "10000", closedAt: new Date(), createdById: "e2e", ...extra,
  participants: { create: [{ employeeId: buyer, side: "BUYER" }, { employeeId: people.seller.id, side: "SELLER", approved: false }] },
} });

before(async () => {
  [nancy, ashraf, manar] = await Promise.all(["nancy.islam@places.com", "ahmed.ashraf@places.com", "manar.ahmed@places.com"].map((e) => session(e)));
  // «blind»: sees deals and client files, but not the expected commissions nor what was collected (M-09)
  roleId = (await prisma.role.create({ data: { key: KEY, label: `E2E blind ${stamp}`, tier: "Executive Staff", scope: "ALL",
    permissions: { create: [{ module: "deals", actions: ["view"] }, { module: "clients", actions: ["view"] }] },
    fieldRules: { create: ["commissionOwner", "commissionClient", "collected"].map((field) => ({ module: "deals", field, mode: "hide" })) } } })).id;
  await person("a", "sales");
  await person("other", "sales");
  await person("seller", "sales");
  await person("blind", KEY);
  leadId = (await prisma.lead.create({ data: {
    code: `L-G${stamp}`, name: `${C} عميل`, phones: [`0105${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: people.a.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } })).id;
  const unit = (n: string) => prisma.unit.create({ data: { code: `U-G${n}${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 100, condition: "Finished", pdfStatus: "confirmed", agentId: people.seller.id } });
  unitId = (await unit("A")).id;
  raceUnitId = (await unit("R")).id;
  const r = await call("/deals", { method: "POST", cookie: people.a.cookie, body: { leadId, unitId, space: 100, type: "Rent", commissionOwner: "60000", commissionClient: "40000", withMe: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealId = r.body.id;
  await prisma.dealParticipant.create({ data: { dealId, employeeId: people.blind.id, side: "BUYER" } }); // a Buyer who can't see the commission
  raceId = (await deal(`D-GR${stamp}`, "PENDING_REVIEW", raceUnitId, people.a.id)).id;
  deadId = (await deal(`D-GX${stamp}`, "CANCELLED", raceUnitId, people.a.id)).id;
  mark(raceId, deadId, `D-GR${stamp}`, `D-GX${stamp}`);
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  const deals = (await prisma.deal.findMany({ where: { unitId: { in: [unitId, raceUnitId] } }, select: { id: true } })).map((d) => d.id);
  const tcrs = (await prisma.tcr.findMany({ where: { dealId: { in: deals } }, select: { id: true } })).map((t) => t.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...deals, ...tcrs, unitId, raceUnitId, roleId] } } });
  await prisma.tcr.deleteMany({ where: { dealId: { in: deals } } });
  await prisma.payment.deleteMany({ where: { dealId: { in: deals } } });
  await cleanFinance(C, since);
  await prisma.deal.deleteMany({ where: { id: { in: deals } } });
  const leads = await prisma.lead.findMany({ where: { code: { startsWith: `L-G` , endsWith: stamp } }, select: { id: true, clientId: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: leads.map((l) => l.id) } } });
  await prisma.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });
  const files = leads.flatMap((l) => (l.clientId ? [l.clientId] : []));
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, raceUnitId] } } });
  const users = Object.values(people).map((p) => p.userId);
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: users } }, { text: { contains: C } }] } });
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.employee.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const collect = (body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body });
const review = (id: string, body: object) => call(`/deals/${id}/review`, { method: "POST", cookie: nancy, body });

test("review under the deal's lock: an approve and a reject at once — one applies, the other is refused", async () => {
  const [ok, no] = await Promise.all([review(raceId, { decision: "approve" }), review(raceId, { decision: "reject", reason: `${C} مرفوضة` })]);
  assert.deepEqual([ok.status, no.status].sort(), [200, 400], JSON.stringify([ok.body, no.body]));
  const d = await prisma.deal.findUniqueOrThrow({ where: { id: raceId } });
  assert.equal(await prisma.auditLog.count({ where: { module: "deals", entityId: raceId, action: { in: ["approve", "reject"] } } }), 1);
  // a rejected deal holds no unit lock; an approved one holds exactly one
  assert.equal(await prisma.unitLock.count({ where: { dealId: raceId } }), d.status === "APPROVED" ? 1 : 0);
});

test("5.4: Manar approves a Seller on a live deal only; nobody without inventory:approve can", async () => {
  const seller = (cookie: string, id: string) => call(`/deals/${id}/seller`, { method: "POST", cookie });
  assert.equal((await seller(nancy, dealId)).status, 403);
  assert.equal((await seller(manar, deadId)).status, 400); // cancelled
  // her «مهامي النهارده» line is what she approves from (her role has no deals:view)
  const home = (await call("/home/deals", { cookie: manar })).body as Array<{ kind: string; id: string }>;
  assert.ok(home.some((x) => x.kind === "dealSeller" && x.id === dealId));
  assert.ok(!home.some((x) => x.id === deadId));
  assert.equal((await call("/deals/sheet", { cookie: manar })).status, 403);
  assert.equal((await seller(manar, dealId)).status, 200);
  assert.equal((await seller(manar, dealId)).status, 400); // nothing waiting any more
});

test("M-09: «deal.approved» tells the commission only to a Buyer who may see it", async () => {
  const r = await review(dealId, { decision: "approve" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const text = async (k: Key) => (await prisma.notification.findFirstOrThrow({ where: { userId: people[k].userId, event: "deal.approved", link: `/deals?open=${dealId}` } })).text;
  assert.match(await text("a"), /العمولة/);
  assert.doesNotMatch(await text("blind"), /العمولة|100,000|100000/);
});

test("5.3: each side up to its own commission, dated between the close day and today", async () => {
  assert.match((await collect({ side: "client", toId: bankId, amount: "40000.01", revenueId })).body.error, /عمولة الـ Client/);
  const tomorrow = localDate(new Date(Date.now() + 86_400_000)), yesterday = localDate(new Date(Date.now() - 86_400_000));
  assert.equal((await collect({ side: "client", toId: bankId, amount: "1000", revenueId, date: tomorrow })).status, 400);
  assert.equal((await collect({ side: "client", toId: bankId, amount: "1000", revenueId, date: yesterday })).status, 400); // closed today
});

test("5.3: a double «سجّل تحصيل» — the two run one after the other, and the second is above what the client side has left", async () => {
  const [one, two] = await Promise.all([collect({ side: "client", toId: bankId, amount: "30000", revenueId }), collect({ side: "client", toId: bankId, amount: "30000", revenueId })]);
  assert.deepEqual([one.status, two.status].sort(), [201, 400], JSON.stringify([one.body, two.body]));
  assert.equal(await prisma.payment.count({ where: { dealId } }), 1);
});

test("5.15 · 5.12: correcting a signed TCR clears its signatures (audited) and asks them again; never above the side", async () => {
  const tcr = (await call(`/deals/${dealId}`, { cookie: people.a.cookie })).body.tcrs[0] as { id: string };
  assert.equal((await call(`/deals/${dealId}/tcrs/${tcr.id}/sign`, { method: "POST", cookie: people.a.cookie })).status, 200);
  const edit = (amount: string) => call(`/deals/${dealId}/tcrs/${tcr.id}`, { method: "PUT", cookie: ashraf, body: { amount, reason: `${C} تصحيح` } });
  assert.equal((await edit("40000.01")).status, 400); // the client owes 40,000
  const r = await edit("35000");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sig = await prisma.tcrSignature.findFirstOrThrow({ where: { tcrId: tcr.id, employeeId: people.a.id } });
  assert.equal(sig.signedAt, null);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: tcr.id, action: "edit-collection" } });
  assert.deepEqual((audit.after as { signaturesReset: string[] }).signaturesReset, [people.a.id]);
  assert.ok(await prisma.notification.findFirst({ where: { userId: people.a.userId, event: "deal.tcr", text: { contains: "اتعدّل" } } }));
});

test("the sheet returns one deal by id (a link outside the loaded period), in the caller's scope", async () => {
  const mine = (await call(`/deals/sheet?id=${dealId}`, { cookie: people.a.cookie })).body as { items: { id: string }[] };
  assert.deepEqual(mine.items.map((x) => x.id), [dealId]);
  const theirs = (await call(`/deals/sheet?id=${dealId}`, { cookie: people.other.cookie })).body as { items: { id: string }[] };
  assert.deepEqual(theirs.items, []);
});

test("M-10 · M-09: the client's file lists only the deals in the reader's deal scope, and the money their deals rules hide is blank", async () => {
  const fileId = (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).clientId!;
  assert.ok(fileId);
  // another salesperson's deal on the same file
  const lead2 = await prisma.lead.create({ data: { code: `L-G2${stamp}`, name: `${C} عميل 2`, phones: [`0105${stamp.slice(-7)}9`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId: people.other.id, createdById: "e2e", clientId: fileId } });
  otherDealId = (await deal(`D-GO${stamp}`, "PENDING_REVIEW", raceUnitId, people.other.id, { leadId: lead2.id })).id;
  const a = (await call(`/clients/${fileId}`, { cookie: people.a.cookie })).body as { deals: { id: string; due: string; paid: string }[] };
  assert.deepEqual(a.deals.map((x) => x.id), [dealId]);
  assert.equal(a.deals[0]!.due, "40000.00");
  const blind = (await call(`/clients/${fileId}`, { cookie: people.blind.cookie })).body as { deals: { id: string; due: string; paid: string }[]; balance: { paid: string; remaining: string } };
  assert.deepEqual(blind.deals.map((x) => x.id).sort(), [dealId, otherDealId].sort()); // an «all» scope sees both
  assert.ok(blind.deals.every((x) => x.due === "" && x.paid === ""));
  assert.deepEqual(blind.balance, { paid: "", remaining: "" });
});

test("a cancelled deal's TCRs leave «امضي عليها» and can't be signed", async () => {
  const tcr = (await call(`/deals/${dealId}`, { cookie: people.a.cookie })).body.tcrs[0] as { id: string };
  const before = (await call("/home/deals", { cookie: people.a.cookie })).body as Array<{ kind: string; id: string }>;
  assert.ok(before.some((x) => x.kind === "tcrSign" && x.id === dealId));
  assert.equal((await call(`/deals/${dealId}/cancel`, { method: "POST", cookie: nancy, body: { reason: `${C} إلغاء` } })).status, 200);
  const after = (await call("/home/deals", { cookie: people.a.cookie })).body as Array<{ kind: string; id: string }>;
  assert.ok(!after.some((x) => x.kind === "tcrSign" && x.id === dealId));
  assert.equal((await call(`/deals/${dealId}/tcrs/${tcr.id}/sign`, { method: "POST", cookie: people.a.cookie })).status, 400);
});
