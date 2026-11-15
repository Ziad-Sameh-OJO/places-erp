/**
 * M-05 · «المسار الوظيفي» (HR, 15 Nov): HR (Basant) defines a track, sets two people's level, sees who is due a promotion
 * from the last two closed quarters (KPI final score + target, «مالوش تارجت» skipped), gets the «مهامي النهارده» line,
 * records the promotion (history + audit). A salesperson can't see or do any of it. The rule's own cases are in
 * packages/domain/test/career.test.ts.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, kpiQuarterLock, session } from "./helpers.ts";

const STAMP = `E2E-career-${Date.now()}`;
const QUARTERS = ["2026-Q3", "2026-Q2"];
let basant: string, sales: string, noTarget: { id: string; name: string }, youssef: { id: string };
let trackId = "";
const made: string[] = [];

before(async () => {
  [basant, sales] = await Promise.all(["basant.elsawy@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  youssef = await prisma.employee.findFirstOrThrow({ where: { user: { email: "youssef.safwat@places.com" } }, select: { id: true } });
  noTarget = await prisma.employee.findFirstOrThrow({
    where: { target: 0, user: { status: "ACTIVE", email: { not: "basant.elsawy@places.com" }, roles: { none: { role: { key: "sales" } } } } },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
});
after(async () => {
  if (trackId) await prisma.careerMove.deleteMany({ where: { level: { trackId } } });
  await prisma.auditLog.deleteMany({ where: { entity: { in: ["CareerTrack", "CareerMove"] }, OR: [{ entityId: trackId }, { entityId: { in: made } }] } });
  if (trackId) await prisma.careerTrack.deleteMany({ where: { id: trackId } });
  await prisma.$disconnect();
});

test("a salesperson can't see or change the career path", async () => {
  assert.equal((await call("/hr/career", { cookie: sales })).status, 403);
  assert.equal((await call("/hr/career/tracks", { method: "POST", cookie: sales, body: { name: STAMP, levels: [{ name: "A" }, { name: "B" }] } })).status, 403);
  assert.equal((await call("/hr/career/moves", { method: "POST", cookie: sales, body: { employeeId: youssef.id, levelId: "x", day: "2026-01-01", kind: "set" } })).status, 403);
});

test("the sample track is there for the client to replace", async () => {
  const r = await call("/hr/career", { cookie: basant });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sample = r.body.tracks.find((t: { sample: boolean }) => t.sample);
  assert.deepEqual(sample.levels.map((l: { name: string }) => l.name), ["Junior", "Senior"]);
  assert.deepEqual(sample.levels[1].rule, { quarters: 2, minKpi: 85, minTarget: 100, minMonths: null });
});

test("HR's track, two people's level, who's due after two closed quarters, the line, then the promotion", () => kpiQuarterLock(async () => {
  const created: string[] = [];
  try {
    for (const id of QUARTERS) if (!(await prisma.kpiQuarter.findUnique({ where: { id } }))) {
      await prisma.kpiQuarter.create({ data: { id, status: "closed", closedAt: new Date() } });
      created.push(id);
    }
    for (const quarter of QUARTERS) for (const employeeId of [noTarget.id, youssef.id]) {
      await prisma.kpiCard.upsert({ where: { quarter_employeeId: { quarter, employeeId } }, create: { quarter, employeeId, finalScore: 90 }, update: { finalScore: 90 } });
    }

    const t = await call("/hr/career/tracks", { method: "POST", cookie: basant, body: { name: STAMP, levels: [{ name: "Junior" }, { name: "Senior", quarters: 2, minKpi: 85, minTarget: 100 }] } });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    trackId = t.body.id;
    const [junior, senior] = t.body.levels as { id: string }[];
    assert.equal((await call("/hr/career/tracks", { method: "POST", cookie: basant, body: { name: STAMP, levels: [{ name: "A" }, { name: "B" }] } })).status, 409, "the same name twice");

    for (const employeeId of [noTarget.id, youssef.id]) {
      const m = await call("/hr/career/moves", { method: "POST", cookie: basant, body: { employeeId, levelId: junior!.id, day: "2025-01-01", kind: "set" } });
      assert.equal(m.status, 201, JSON.stringify(m.body));
      made.push(m.body.id);
    }
    // a level someone is on can't be removed
    assert.equal((await call(`/hr/career/tracks/${trackId}`, { method: "PUT", cookie: basant, body: { name: STAMP, levels: [{ id: senior!.id, name: "Senior" }, { name: "Lead" }] } })).status, 409);

    const v = await call("/hr/career", { cookie: basant });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.lastClosed, "2026-Q3");
    type Row = { employeeId: string; status: string; next: { name: string } | null; check: { kpi: boolean; target: boolean | null; quarters: { quarter: string; kpi: number; target: number | null }[] }; history: unknown[] };
    const row = (id: string) => (v.body.rows as Row[]).find((r) => r.employeeId === id)!;
    const a = row(noTarget.id);
    assert.equal(a.status, "due", JSON.stringify(a));
    assert.equal(a.next?.name, "Senior");
    assert.equal(a.check.target, null, "no target → skipped");
    assert.deepEqual(a.check.quarters.map((q) => [q.quarter, q.kpi]), [["2026-Q3", 90], ["2026-Q2", 90]]);
    const y = row(youssef.id);
    assert.equal(y.check.kpi, true);
    assert.equal(y.status, y.check.target === false ? "near" : "due", "KPIs met; the target decides");

    const home = await call("/home/hr", { cookie: basant });
    assert.ok((home.body as { kind: string; id: string }[]).some((l) => l.kind === "careerDue" && l.id === noTarget.id), "«مهامي النهارده» line for HR");

    const p = await call("/hr/career/moves", { method: "POST", cookie: basant, body: { employeeId: noTarget.id, levelId: senior!.id, day: "2026-11-15", kind: "promotion", note: STAMP } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    made.push(p.body.id);
    const after = (await call("/hr/career", { cookie: basant })).body.rows.find((r: Row) => r.employeeId === noTarget.id);
    assert.equal(after.status, "top");
    assert.equal(after.level.name, "Senior");
    assert.equal(after.history.length, 2);
    assert.equal(after.history[0].kind, "promotion");
    const audit = await prisma.auditLog.findFirst({ where: { entity: "CareerMove", entityId: p.body.id, action: "promote" } });
    assert.ok(audit, "the promotion is audited");
    assert.equal((await call(`/hr/career/tracks/${trackId}`, { method: "DELETE", cookie: basant })).status, 409, "a track with people on it stays");
  } finally {
    await prisma.kpiCard.deleteMany({ where: { quarter: { in: QUARTERS }, employeeId: { in: [noTarget.id, youssef.id] }, items: { none: {} } } });
    if (created.length) await prisma.kpiQuarter.deleteMany({ where: { id: { in: created } } });
  }
}));
