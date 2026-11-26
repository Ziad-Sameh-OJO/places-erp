/**
 * M-13 2.1 · «الإعدادات ← القوايم»: two saves of one list at the same moment never drop a value silently, the same
 * value with other capitals / spaces isn't added twice, and a leave type is never dropped (leaves keep its name).
 * Settings are shared with the other tests: each one puts the setting back in `finally`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let admin: string, hr: string, sales: string;
type Item = { value: string; active: boolean };
const KEY = "mkTaskTypes";
const list = async () => (await call("/settings", { cookie: admin })).body[KEY] as Item[];
const put = (cookie: string, key: string, value: unknown) => call(`/settings/${key}`, { method: "PUT", cookie, body: { value } });

async function keeping<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const was = await prisma.setting.findUnique({ where: { key } });
  try { return await fn(); } finally {
    if (was) await prisma.setting.update({ where: { key }, data: { value: was.value as never } });
    else await prisma.setting.deleteMany({ where: { key } });
  }
}

before(async () => {
  [admin, hr, sales] = await Promise.all(["ahmed.islam@places.com", "basant.elsawy@places.com", "m.mohsen@places.com"].map((e) => session(e)));
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Setting", entityId: { in: [KEY, "leaveTypes"] }, at: { gte: new Date(Number(stamp)) } } });
  await prisma.$disconnect();
});

test("a salesperson can't change a list (403)", async () => {
  const now = await list();
  assert.equal((await put(sales, KEY, [...now, { value: `E2E ${stamp}`, active: true }])).status, 403);
});

test("two saves of the same list at once: every value a save reported as saved is still there", () => keeping(KEY, async () => {
  const now = await list();
  const values = Array.from({ length: 4 }, (_, i) => `E2E race ${stamp} ${i}`);
  const res = await Promise.all(values.map((v) => put(admin, KEY, [...now, { value: v, active: true }])));
  const saved = values.filter((_, i) => res[i]!.status === 200);
  assert.ok(saved.length >= 1, JSON.stringify(res.map((r) => r.body)));
  assert.ok(res.every((r) => r.status === 200 || r.status === 400), JSON.stringify(res.map((r) => r.status)));
  const after = (await list()).map((i) => i.value);
  for (const v of saved) assert.ok(after.includes(v), `«${v}» was saved and then lost`);
}));

test("the same value with other capitals or spaces isn't added twice (400)", () => keeping(KEY, async () => {
  const now = await list();
  const v = `E2E Twin ${stamp}`;
  assert.equal((await put(admin, KEY, [...now, { value: v, active: true }])).status, 200);
  const r = await put(admin, KEY, [...now, { value: v, active: true }, { value: `e2e  twin ${stamp}`, active: true }]);
  assert.equal(r.status, 400, JSON.stringify(r.body));
}));

test("a leave type is never dropped or renamed (400); its balance can change", () => keeping("leaveTypes", async () => {
  const types = (await call("/settings", { cookie: hr })).body.leaveTypes as { name: string; days: number }[];
  assert.equal((await put(hr, "leaveTypes", types.slice(1))).status, 400);
  assert.equal((await put(hr, "leaveTypes", types.map((t, i) => (i ? t : { ...t, name: `${t.name} ${stamp}` })))).status, 400);
  const r = await put(hr, "leaveTypes", types.map((t) => ({ ...t, days: t.days })));
  assert.equal(r.status, 200, JSON.stringify(r.body));
}));
