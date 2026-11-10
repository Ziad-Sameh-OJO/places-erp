/**
 * 11.16 · home: «الـ KPIs بتاعتي» and the KPI lines of «مهامي النهارده» (demo kpis.js kpiMine / kpiInbox), against the
 * real API. A person made for this file has a card in the current quarter that Heba follows; one of its manual items
 * is typed by HR (Basant). Mohamed Mohsen (sales) is unrelated to it. Held under the quarter lock: kpis.e2e switches it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { PW, call, kpiQuarterLock, session } from "./helpers.ts";

const stamp = Date.now();
const email = `kpihome-${stamp}@places.test`;
let me: string, heba: string, basant: string, mohsen: string, userId = "", employeeId = "", cardId = "";
type Line = { kind: string; cardId: string; name: string; manual?: number; item?: string; delivered?: number; required?: number };
type Home = { mine: { id: string; follower: string; belowCount: number; below: { title: string }[] } | null; lines: Line[] };

before(async () => {
  [heba, basant, mohsen] = await Promise.all(["heba.salah@places.com", "basant.elsawy@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const role = await prisma.role.findFirstOrThrow({ where: { key: "sales" } });
  const user = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId: role.id, primary: true }] },
    employee: { create: { name: `E2E كارت ${stamp}`, jobTitle: "Sales", department: "المبيعات", salary: 0 } } }, include: { employee: true } });
  userId = user.id; employeeId = user.employee!.id;
  me = await session(email);
});
after(async () => {
  await prisma.kpiCard.deleteMany({ where: { employeeId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.employee.deleteMany({ where: { id: employeeId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

const home = async (cookie: string) => {
  const r = await call("/home/kpis", { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as Home;
};

test("my card with the items under target; the follower's «approve», HR's «enter», my «deliver»; others see nothing of it", () => kpiQuarterLock(async () => {
  const q = await prisma.kpiQuarter.findFirstOrThrow({ orderBy: { id: "desc" } });
  if (q.status !== "open") return; // a closed quarter has no lines (kpis.e2e reopens it)
  const hebaEmp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "heba.salah@places.com" } } });
  cardId = (await prisma.kpiCard.create({ data: { quarter: q.id, employeeId, followerId: hebaEmp.id, items: { create: [
    { position: 0, title: "التقييم", weight: 40, targetText: "100%", method: "manual", goal: 100, enteredBy: ["follower"] },
    { position: 1, title: "الالتزام", weight: 30, targetText: "100%", method: "manual", goal: 100, enteredBy: ["hr"] },
    { position: 2, title: "Market report", weight: 30, targetText: "2 في الربع", method: "report", goal: 100, required: 2 },
  ] } } })).id;

  const mine = await home(me);
  assert.equal(mine.mine?.id, cardId);
  assert.equal(mine.mine?.follower, "هبة صلاح");
  assert.equal(mine.mine?.belowCount, 3);
  assert.deepEqual(mine.lines.filter((l) => l.cardId === cardId).map(({ kind, item, delivered, required, name }) => ({ kind, item, delivered, required, name })),
    [{ kind: "deliver", item: "Market report", delivered: 0, required: 2, name: `E2E كارت ${stamp}` }]);

  const follower = (await home(heba)).lines.filter((l) => l.cardId === cardId);
  assert.deepEqual(follower.map((l) => [l.kind, l.manual]), [["approve", 2]]);
  const hr = (await home(basant)).lines.filter((l) => l.cardId === cardId);
  assert.deepEqual(hr.map((l) => [l.kind, l.manual]), [["enter", 1]]);
  const other = await home(mohsen);
  assert.ok(!other.lines.some((l) => l.cardId === cardId));
  assert.notEqual(other.mine?.id, cardId);

  // approved: the follower's line goes
  await prisma.kpiCard.update({ where: { id: cardId }, data: { approvedAt: new Date(), approvedBy: userId } });
  assert.ok(!(await home(heba)).lines.some((l) => l.cardId === cardId));
}));

test("signed out: 401", async () => {
  assert.equal((await call("/home/kpis")).status, 401);
});
