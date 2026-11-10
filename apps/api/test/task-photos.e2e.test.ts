/**
 * 4.12 · M-03 3.1 «مهمة Retouch»: the unit's Pic & Info photos reach the designer with the task — he opens and downloads
 * them (one by one or the ZIP) and adds the edited ones to the unit's folder while working it; once sent to Manar, no
 * more. Manar = inventory, Bayoumi = photographer (also takes Retouch, M-04 1.2), Rahma = marketing (sees the task,
 * doesn't upload), a salesperson = no tasks. The upload parts need file storage (pnpm files:local; always in CI).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const stamp = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let manar: string, bayoumi: string, rahma: string, sales: string, bayoumiId: string, unitId: string;
const tasks: string[] = [], files: string[] = [];

before(async () => {
  [manar, bayoumi, rahma, sales] = await Promise.all(["manar.ahmed@places.com", "abdelrahman.bayoumi@places.com", "rahma.hassan@places.com", "anas@places.com"].map((e) => session(e)));
  bayoumiId = (await prisma.user.findUniqueOrThrow({ where: { email: "abdelrahman.bayoumi@places.com" } })).id;
  unitId = (await prisma.unit.create({ data: { code: `U-R${stamp}`, type: "Rent", project: `E2E ${stamp} Retouch`, area: "التجمع الخامس", space: 120, condition: "Finished", pdfStatus: "confirmed" } })).id;
});
after(async () => {
  await prisma.notification.deleteMany({ where: { OR: tasks.map((id) => ({ link: { contains: id } })) } });
  await prisma.task.deleteMany({ where: { id: { in: tasks } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.file.deleteMany({ where: { id: { in: files } } });
  await prisma.$disconnect();
});

async function give(kind: string) {
  const r = await call("/tasks", { method: "POST", cookie: manar, body: { kind, toUserId: bayoumiId, dueOn: today, unitId, note: "الصور على السيستم" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tasks.push(r.body.id);
  return r.body.id as string;
}
async function upload(cookie: string, name: string) {
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name, mime: "image/png", size: PNG.length } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: PNG })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie })).status, 200);
  return t.body.id as string;
}
const folder = (cookie: string, id: string) => call(`/tasks/${id}/photos`, { cookie });
const add = (cookie: string, id: string, fileIds: string[]) => call(`/tasks/${id}/photos`, { method: "POST", cookie, body: { fileIds } });
const can = async (cookie: string, id: string) => ((await call(`/tasks/${id}`, { cookie })).body as { can: { folder: { open: boolean; upload: boolean } } }).can.folder;

test("who opens the folder from a task: the Retouch's people, not a shoot, not someone without tasks", async () => {
  const retouch = await give("retouch"), photo = await give("photo");
  assert.deepEqual(await can(bayoumi, retouch), { open: true, upload: true });
  assert.deepEqual(await can(rahma, retouch), { open: true, upload: false }); // she sees her department's tasks (M-04 4.1)
  assert.deepEqual(await can(bayoumi, photo), { open: false, upload: false });
  assert.equal((await folder(bayoumi, retouch)).status, 200);
  assert.equal((await folder(rahma, retouch)).status, 200);
  assert.equal((await folder(bayoumi, photo)).status, 403);
  assert.equal((await folder(sales, retouch)).status, 403);
  assert.equal((await add(rahma, retouch, ["x"])).status, 403);
  assert.equal((await add(sales, retouch, ["x"])).status, 403);
  // the photographer has no inventory: the unit's own folder stays closed to him
  assert.equal((await call(`/inventory/units/${unitId}/photos`, { cookie: bayoumi })).status, 403);
});

test("4.12: Manar's photos reach the designer; he downloads them, adds the edited ones (audited, PDF back to draft) until he sends it to Manar", { skip }, async () => {
  const id = await give("retouch");
  const raw = await upload(manar, "خام.png");
  assert.equal((await call(`/inventory/units/${unitId}/photos`, { method: "POST", cookie: manar, body: { fileIds: [raw] } })).status, 201);
  const got = await folder(bayoumi, id);
  assert.deepEqual((got.body as Array<{ name: string }>).map((p) => p.name), ["خام.png"]);
  const photo = (got.body as Array<{ url: string; download: string }>)[0]!;
  assert.ok(Buffer.from(await (await fetch(photo.download)).arrayBuffer()).equals(PNG));
  const zip = await fetch(`${API}/tasks/${id}/photos/zip`, { headers: { cookie: bayoumi } });
  assert.equal(zip.status, 200);
  assert.match(decodeURIComponent(zip.headers.get("content-disposition") ?? ""), new RegExp(`U-R${stamp} - Pic & Info\\.zip`));
  await prisma.unit.update({ where: { id: unitId }, data: { pdfStatus: "confirmed" } });

  const edited = await upload(bayoumi, "بعد-الـRetouch.png");
  const r = await add(bayoumi, id, [edited]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual((r.body as Array<{ name: string }>).map((p) => p.name), ["خام.png", "بعد-الـRetouch.png"]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "photos-add", userId: bayoumiId } }));
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).pdfStatus, "draft"); // M-03 Q19: Manar confirms again
  // Manar sees them on the unit's page
  assert.equal(((await call(`/inventory/units/${unitId}/photos`, { cookie: manar })).body as unknown[]).length, 2);

  assert.equal((await call(`/tasks/${id}/status`, { method: "POST", cookie: bayoumi, body: { status: "uploaded" } })).status, 200);
  assert.deepEqual(await can(bayoumi, id), { open: true, upload: false });
  assert.equal((await add(bayoumi, id, [await upload(bayoumi, "متأخرة.png")])).status, 403);
});
