/**
 * 4.13 · «Website Ads» on the units sheet: marketing (Rahma, Marketing Manager) marks a unit's ad as posted on the
 * website (Yes) or takes it back (No); who and when come back for the tooltip, every switch is audited, and the
 * Yes / No filter works. Nobody else gets the field, the filter or the switch (Manar, the Super Admin, sales).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E webad ${Date.now()}`;
let manar: string, rahma: string, admin: string, sales: string, rahmaId: string;

before(async () => {
  [manar, rahma, admin, sales] = await Promise.all(
    ["manar.ahmed@places.com", "rahma.hassan@places.com", "ahmed.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)),
  );
  rahmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id;
});
after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true } });
  const ids = units.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

type Row = { id: string; websiteAd?: { at: string; by: { id: string; name: string } | null } | null };
const rows = async (cookie: string, extra = "") => {
  const r = await call(`/inventory/units?q=${encodeURIComponent(P)}&pageSize=50${extra}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body as { items: Row[] }).items;
};

test("marketing switches «Website Ads» Yes / No: who and when, audited, filtered; nobody else sees or switches it", async () => {
  const ids: string[] = [];
  for (const name of ["A", "B"]) {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body: { type: "Rent", project: `${P} ${name}`, space: 100 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push((r.body as { id: string }).id);
  }
  await prisma.unit.updateMany({ where: { id: { in: ids } }, data: { pdfStatus: "confirmed" } });
  const [a, b] = ids as [string, string];

  // No at first, for marketing; the others don't get the field at all
  assert.deepEqual((await rows(rahma)).map((u) => u.websiteAd), [null, null]);
  for (const cookie of [manar, admin, sales]) assert.ok((await rows(cookie)).every((u) => !("websiteAd" in u)));

  // only marketing switches it (sales have no marketing edit; Manar and the admin aren't marketing)
  for (const cookie of [manar, admin, sales]) assert.equal((await call(`/inventory/units/${a}/website-ad`, { method: "POST", cookie, body: { posted: true } })).status, 403);
  assert.equal((await call(`/inventory/units/${a}/website-ad`, { method: "POST", cookie: rahma, body: {} })).status, 400);

  const yes = await call(`/inventory/units/${a}/website-ad`, { method: "POST", cookie: rahma, body: { posted: true } });
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  const ad = (yes.body as Row).websiteAd!;
  assert.equal(ad.by?.id, rahmaId);
  assert.ok(Date.now() - Date.parse(ad.at) < 60_000);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Unit", entityId: a, action: "website-ad" } });
  assert.equal(log.userId, rahmaId);
  assert.equal(log.module, "marketing");

  // the filter: Yes → A, No → B; ignored for anyone else
  assert.deepEqual((await rows(rahma, "&websiteAd=yes")).map((u) => u.id), [a]);
  assert.deepEqual((await rows(rahma, "&websiteAd=no")).map((u) => u.id), [b]);
  assert.deepEqual((await rows(admin, "&websiteAd=yes")).map((u) => u.id).sort(), [a, b].sort());
  // the unit for others: still no field
  assert.ok(!("websiteAd" in ((await call(`/inventory/units/${a}`, { cookie: manar })).body as Row)));

  // back to No: audited too
  const no = await call(`/inventory/units/${a}/website-ad`, { method: "POST", cookie: rahma, body: { posted: false } });
  assert.equal(no.status, 200);
  assert.equal((no.body as Row).websiteAd, null);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", entityId: a, action: "website-ad-undo" } }), 1);
});
