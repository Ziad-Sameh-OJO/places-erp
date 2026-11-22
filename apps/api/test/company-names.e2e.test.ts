/**
 * Company names typed by hand (client, 22 Nov): the search finds a company however its name was spelled, offers the
 * closest names when nothing matches («تقصد»), and the same name spelled another way is the same company — when a
 * lead is entered and when a company is added to the sheet.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const stamp = String(Date.now());
// a made-up word per run, letters only, so no other company is close to it
const WORD = `zq${[...stamp.slice(-8)].map((d) => "abcdefghij"[Number(d)]).join("")}`;
const NAME = `إعمار ${WORD}`;
const TYPO = `${WORD.slice(0, 5)}x${WORD.slice(6)}`; // one letter wrong
let hadeer: string, heba: string, hr: string, category: string, companyId: string;
const leadIds: string[] = [];

before(async () => {
  [hadeer, heba, hr] = await Promise.all(["hadeer.tarek@places.com", "heba.salah@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  category = ((await call("/companies?pageSize=1", { cookie: hadeer })).body.categories as { name: string }[]).at(-1)!.name;
  const r = await call("/companies", { method: "POST", cookie: hadeer, body: { name: NAME, category, number: `0155${stamp.slice(-7)}` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  companyId = r.body.id;
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  const companies = await prisma.company.findMany({ where: { name: { contains: WORD } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...companies.map((c) => c.id), ...leadIds] } } });
  await prisma.company.deleteMany({ where: { id: { in: companies.map((c) => c.id) } } });
  await prisma.notification.deleteMany({ where: { createdAt: { gte: START }, text: { contains: WORD } } });
  await prisma.$disconnect();
});

const q = (s: string) => encodeURIComponent(s);

test("who: the sheet's close names for who enters leads, «تقصد» for who sees leads; HR neither (403)", async () => {
  assert.equal((await call(`/companies/similar?q=${q(TYPO)}`, { cookie: hadeer })).status, 200);
  assert.equal((await call(`/companies/similar?q=${q(TYPO)}`, { cookie: hr })).status, 403);
  assert.equal((await call(`/leads/company-suggestions?q=${q(TYPO)}`, { cookie: heba })).status, 200);
  assert.equal((await call(`/leads/company-suggestions?q=${q(TYPO)}`, { cookie: hr })).status, 403);
});

test("the sheet: found without the hamza, close names offered for a typo, none for what the search already finds", async () => {
  assert.deepEqual((await call(`/companies/names?q=${q(`اعمار ${WORD}`)}`, { cookie: hadeer })).body, [NAME]);
  assert.deepEqual((await call(`/companies/similar?q=${q(TYPO)}`, { cookie: hadeer })).body, [NAME]);
  assert.deepEqual((await call(`/companies/similar?q=${q(WORD)}`, { cookie: hadeer })).body, []);
  // the sheet's own search, spelled the other way
  const sheet = (await call(`/companies?pageSize=5&q=${q(`اعمار ${WORD.toUpperCase()}`)}`, { cookie: hadeer })).body;
  assert.deepEqual(sheet.items.map((c: { id: string }) => c.id), [companyId]);
});

test("the same name spelled another way is the same company: 409 when added again", async () => {
  const r = await call("/companies", { method: "POST", cookie: hadeer, body: { name: `  اعمار   ${WORD.toUpperCase()} `, category, number: "01000000009" } });
  assert.equal(r.status, 409);
});

test("a lead written «اعمار …» joins «إعمار …» (no new-company request); the leads' search finds it either way; «تقصد» for a typo", async () => {
  const r = await call("/leads", { method: "POST", cookie: heba, body: { name: `E2E ${WORD} عميل`, phones: [`0109${stamp.slice(-7)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", company: `اعمار ${WORD}` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadIds.push(r.body.id);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.body.id }, select: { companyId: true } });
  assert.equal(lead.companyId, companyId);
  assert.equal(await prisma.companyRequest.count({ where: { leadId: r.body.id } }), 0);

  for (const search of [NAME, `اعمار ${WORD}`, WORD.toUpperCase()]) {
    const found = (await call(`/leads?pageSize=10&q=${q(search)}`, { cookie: heba })).body.items.map((l: { id: string }) => l.id);
    assert.ok(found.includes(r.body.id), search);
  }
  assert.equal((await call(`/leads?pageSize=10&q=${q(TYPO)}`, { cookie: heba })).body.total, 0);
  assert.deepEqual((await call(`/leads/company-suggestions?q=${q(TYPO)}`, { cookie: heba })).body, [NAME]);
});
