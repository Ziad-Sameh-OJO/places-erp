/**
 * 14.8 – 14.11 (T-28) against the real API: the lead's units log (List of options → Visits → Short list → Meeting),
 * a List of options from the inventory recorded on one of the salesperson's leads, Done as a Showing with «نزلت معاه
 * على …» and the units editable after it, the visited units first in the recommendations, and the manual Short list.
 * Mohamed Mohsen = sales (the lead is his); Basant = HR (no leads); another salesperson's lead is out of his scope.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, mark, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
mark(stamp);
let mohsen: string, hr: string, mohsenUser: string;
let lead: string, other: string;
const unit: Record<"a" | "b" | "far", string> = { a: "", b: "", far: "" };

before(async () => {
  [mohsen, hr] = await Promise.all(["m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  mohsenUser = emp.userId;
  const someoneElse = await prisma.employee.findFirstOrThrow({ where: { id: { not: emp.id }, user: { roles: { some: { role: { key: "sales" } } } } } });
  const mk = (n: number, assignedToId: string) => prisma.lead.create({ data: {
    code: `L-J${stamp}${n}`, name: `E2E ${stamp} رحلة ${n}`, phones: [`0102${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", space: 100,
    channel: "Facebook", assignedToId, assignedAt: new Date(), createdById: "e2e", stage: "INTERESTED", qualified: true,
  } });
  lead = (await mk(1, emp.id)).id;
  other = (await mk(2, someoneElse.id)).id;
  const u = (n: number, space: number, building: string) => prisma.unit.create({ data: {
    code: `U-J${stamp}${n}`, type: "Rent", project: `رحلة ${stamp}`, area: "التجمع الخامس", space, condition: "Finished", building, pdfStatus: "confirmed",
  } });
  unit.a = (await u(1, 95, `B${stamp}1`)).id;
  unit.b = (await u(2, 105, `B${stamp}2`)).id;
  unit.far = (await u(3, 400, `B${stamp}3`)).id;
});

after(async () => {
  await prisma.attendanceDay.deleteMany({ where: { employee: { userId: mohsenUser }, source: "visit", createdAt: { gte: START } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-J${stamp}` } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-J${stamp}` } } });
  await prisma.$disconnect();
});

const journey = async (cookie: string, id = lead) => call(`/leads/${id}/unit-journey`, { cookie });
type Stage = { stage: string; steps: { stage: string; outcome: string | null; units: { id: string; code: string }[] }[] };
const stage = (body: { stages: Stage[] }, s: string) => body.stages.find((x) => x.stage === s)!.steps;

test("14.11 · the manual pick's search: by building number, and a space range", async () => {
  const byBuilding = await call(`/leads/visit-units?q=${encodeURIComponent(`B${stamp}2`)}`, { cookie: mohsen });
  assert.equal(byBuilding.status, 200);
  assert.deepEqual(byBuilding.body.map((u: { id: string }) => u.id), [unit.b]);
  const ranged = await call(`/leads/visit-units?q=${encodeURIComponent(`رحلة ${stamp}`)}&spaceMin=50&spaceMax=100`, { cookie: mohsen });
  assert.deepEqual(ranged.body.map((u: { id: string }) => u.id), [unit.a]);
  assert.equal((await call(`/leads/visit-units?spaceMin=100&spaceMax=50`, { cookie: mohsen })).status, 400);
});

test("14.9 · a List of options from the inventory recorded on his lead: the file, the Activity line, the log, the audit", async () => {
  const r = await fetch(`${API}/leads/${lead}/options-list`, { method: "POST", headers: { cookie: mohsen, "content-type": "application/json" },
    body: JSON.stringify({ unitIds: [unit.a, unit.b], kind: "slide", format: "pdf" }) });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get("content-type"), "application/pdf");
  assert.match(decodeURIComponent(r.headers.get("content-disposition") ?? ""), new RegExp(`E2E ${stamp} رحلة 1`)); // the lead's name on it
  const line = await prisma.leadActivity.findFirst({ where: { leadId: lead, text: { startsWith: "اتبعتله List of options" } } });
  assert.ok(line?.text.includes(`U-J${stamp}1، U-J${stamp}2`), line?.text);
  const j = await journey(mohsen);
  assert.equal(j.status, 200);
  assert.deepEqual(stage(j.body, "list")[0]!.units.map((u) => u.id), [unit.a, unit.b]);
  assert.equal(await prisma.auditLog.count({ where: { entity: "LeadUnitStep", action: "list", after: { path: ["leadId"], equals: lead } } }), 1);

  // refused: HR (no leads), another salesperson's lead, a draft unit
  const post = (cookie: string, id: string, unitIds: string[]) => fetch(`${API}/leads/${id}/options-list`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ unitIds, kind: "slide", format: "pdf" }) });
  assert.equal((await post(hr, lead, [unit.a])).status, 403);
  assert.equal((await post(mohsen, other, [unit.a])).status, 404);
  assert.equal(await prisma.leadUnitStep.count({ where: { leadId: other } }), 0);
});

test("14.10 · Done records a Showing «نزلت معاه على …»; after it the units can change, not the time", async () => {
  const at = new Date(Date.now() - 60_000).toISOString();
  const r = await call(`/leads/${lead}/visits`, { method: "POST", cookie: mohsen, body: { kind: "Visit", at, unitIds: [unit.a, unit.b], extra: "دور 4 في مبنى X" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const vid = r.body.visits[0].id;
  const done = await call(`/leads/${lead}/visits/${vid}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "done" } });
  assert.equal(done.status, 200);
  const line = await prisma.leadActivity.findFirst({ where: { leadId: lead, text: { contains: "نزلت معاه على" } } });
  assert.equal(line?.text, `Visit Done · نزلت معاه على U-J${stamp}1، U-J${stamp}2، دور 4 في مبنى X · اتحسبت Showing`);
  // the Showing: a Visit marked Done (the KPI's «visitsDone»)
  assert.equal(await prisma.leadVisit.count({ where: { id: vid, outcome: "done" } }), 1);

  // one unit wasn't visited after all: the units change, the outcome stays
  const edited = await call(`/leads/${lead}/visits/${vid}`, { method: "PUT", cookie: mohsen, body: { kind: "Visit", at, unitIds: [unit.b] } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.visits[0].outcome, "done");
  assert.deepEqual(edited.body.visits[0].units.map((u: { id: string }) => u.id), [unit.b]);
  assert.equal((await call(`/leads/${lead}/visits/${vid}`, { method: "PUT", cookie: mohsen, body: { kind: "Visit", at: new Date().toISOString(), unitIds: [unit.b] } })).status, 400);
  assert.equal((await call(`/leads/${lead}/visits/${vid}`, { method: "PUT", cookie: hr, body: { kind: "Visit", at, unitIds: [] } })).status, 403);

  const j = await journey(mohsen);
  const v = stage(j.body, "visit");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.outcome, "done");
  assert.deepEqual(v[0]!.units.map((u) => u.id), [unit.b]);
});

test("14.11 · the visited unit comes first in the recommendations, marked", async () => {
  const r = await call(`/leads/${lead}/recommendations`, { cookie: mohsen });
  assert.equal(r.status, 200);
  const mine = r.body.items.filter((u: { code: string }) => u.code.includes(stamp));
  assert.ok(mine.length >= 2, JSON.stringify(r.body.items.map((u: { code: string }) => u.code)));
  assert.equal(r.body.items[0].id, unit.b);
  assert.equal(r.body.items[0].visited, true);
  assert.equal(mine.find((u: { id: string }) => u.id === unit.a).visited, false);
});

test("14.11 · the manual pick is saved as the lead's Short list; HR and someone else's lead are refused", async () => {
  const r = await call(`/leads/${lead}/shortlist`, { method: "POST", cookie: mohsen, body: { unitIds: [unit.far, unit.a] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(stage(r.body, "shortlist")[0]!.units.map((u) => u.id), [unit.far, unit.a]);
  assert.deepEqual(r.body.stages.map((s: Stage) => s.stage), ["list", "visit", "shortlist", "meeting"]);
  assert.equal(await prisma.leadUnit.count({ where: { leadId: lead, unitId: unit.far } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entity: "LeadUnitStep", action: "shortlist", after: { path: ["leadId"], equals: lead } } }), 1);

  assert.equal((await call(`/leads/${lead}/shortlist`, { method: "POST", cookie: hr, body: { unitIds: [unit.a] } })).status, 403);
  assert.equal((await call(`/leads/${other}/shortlist`, { method: "POST", cookie: mohsen, body: { unitIds: [unit.a] } })).status, 404);
  assert.equal((await journey(hr)).status, 403);
  assert.equal((await journey(mohsen, other)).status, 404);
  assert.equal((await call(`/leads/${lead}/shortlist`, { method: "POST", cookie: mohsen, body: { unitIds: [] } })).status, 400);
});
