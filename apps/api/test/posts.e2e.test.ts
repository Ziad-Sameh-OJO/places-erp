/**
 * M-04 · the Content plan end-to-end (4.7): Rahma plans a post; the Reminder reaches her at its time, once (the
 * worker's job, 2.4 · 7.1); a post from someone who can't approve waits for the manager (2.2); «اتنشر» records the
 * actual time; sales can't see it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { postReminderTick } from "../../worker/src/processors/post-reminder.ts";
import { call, session } from "./helpers.ts";

const stamp = Date.now().toString(36);
const WRITER = "youssef.hosny@places.com"; // a salesperson given «marketing: view + create» for this test: his posts wait for approval
let rahma: string, sales: string, writer: string, rahmaId: string, writerId: string, channel: string;
const posts: string[] = [];

/** Cairo wall time «YYYY-MM-DDTHH:mm», `minutes` from now. */
const cairoAt = (minutes: number) => new Date(Date.now() + minutes * 60_000).toLocaleString("sv-SE", { timeZone: "Africa/Cairo" }).slice(0, 16).replace(" ", "T");

before(async () => {
  writerId = (await prisma.user.findUniqueOrThrow({ where: { email: WRITER } })).id;
  rahmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id;
  await prisma.permissionOverride.upsert({ where: { userId_module: { userId: writerId, module: "marketing" } }, create: { userId: writerId, module: "marketing", actions: ["view", "create"] }, update: { actions: ["view", "create"] } });
  [rahma, sales, writer] = await Promise.all(["rahma.hassan@places.com", "anas@places.com", WRITER].map((e) => session(e)));
  channel = (await call("/marketing/campaigns/channels", { cookie: rahma })).body[0];
});

after(async () => {
  await prisma.permissionOverride.deleteMany({ where: { userId: writerId, module: "marketing" } });
  await prisma.notification.deleteMany({ where: { text: { contains: stamp } } });
  await prisma.post.deleteMany({ where: { id: { in: posts } } });
  await prisma.$disconnect();
});

async function plan(cookie: string, title: string, minutes: number) {
  const r = await call("/marketing/posts", { method: "POST", cookie, body: { title: `${title} ${stamp}`, channel, at: cairoAt(minutes), description: "E2E" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  posts.push(r.body.id);
  return r.body.id as string;
}
const reminders = (userId: string, title: string) => prisma.notification.count({ where: { userId, text: { contains: `${title} ${stamp}` } } });

test("sales can't see or plan posts (403); a bad time and a channel off the list are refused", async () => {
  assert.equal((await call("/marketing/posts", { cookie: sales })).status, 403);
  assert.equal((await call("/marketing/posts", { method: "POST", cookie: sales, body: { title: "x", channel, at: cairoAt(5) } })).status, 403);
  assert.equal((await call("/marketing/posts", { method: "POST", cookie: rahma, body: { title: "E2E", channel, at: "2026-11-05 19:00" } })).status, 400);
  assert.equal((await call("/marketing/posts", { method: "POST", cookie: rahma, body: { title: "E2E", channel: "مش في القايمة", at: cairoAt(5) } })).status, 400);
});

test("M-04 7.1: a post at its time → the Reminder reaches Rahma once; a later post waits; «اتنشر» records the time", async () => {
  // this minute (cairoAt cuts the seconds, so it's already due): «a minute ago» is yesterday right after Cairo's midnight
  const now = await plan(rahma, "بوست دلوقتي", 0);
  const later = await plan(rahma, "بوست بكرة", 24 * 60);
  const list = (await call(`/marketing/posts?month=${cairoAt(0).slice(0, 7)}`, { cookie: rahma })).body as Array<{ id: string; state: string; approved: boolean }>;
  assert.equal(list.find((p) => p.id === now)?.state, "today");
  assert.equal(list.find((p) => p.id === now)?.approved, true); // the manager's own post needs no review

  await postReminderTick();
  assert.equal(await reminders(rahmaId, "بوست دلوقتي"), 1);
  assert.equal(await reminders(rahmaId, "بوست بكرة"), 0);
  await postReminderTick(); // the worker may run twice: still one
  assert.equal(await reminders(rahmaId, "بوست دلوقتي"), 1);

  assert.equal((await call(`/marketing/posts/${now}/published`, { method: "POST", cookie: rahma })).status, 204);
  const p = await prisma.post.findUniqueOrThrow({ where: { id: now } });
  assert.ok(p.publishedAt && Math.abs(p.publishedAt.getTime() - Date.now()) < 60_000);
  assert.equal((await call(`/marketing/posts/${now}/published`, { method: "POST", cookie: rahma })).status, 400);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Post", entityId: now } }), 2);
  assert.equal((await call(`/marketing/posts/${later}`, { method: "DELETE", cookie: rahma })).status, 204);
});

test("M-04 2.2: a post from someone who can't approve waits — no Reminder until the manager approves it", async () => {
  const id = await plan(writer, "بوست مستني", -1);
  assert.equal((await call("/marketing/posts", { cookie: writer })).body.find((p: { id: string }) => p.id === id).state, "waiting");
  await postReminderTick();
  assert.equal(await reminders(rahmaId, "بوست مستني"), 0);
  assert.equal((await call(`/marketing/posts/${id}/approve`, { method: "POST", cookie: writer })).status, 403);
  assert.equal((await call(`/marketing/posts/${id}/approve`, { method: "POST", cookie: rahma })).status, 204);
  await postReminderTick();
  assert.equal(await reminders(rahmaId, "بوست مستني"), 1);
  assert.equal(await reminders(writerId, "بوست مستني"), 1); // whoever planned it hears too
});

// 4.21 · locally it waits for file storage; in CI (where it always runs) a missing store is a failure
const storage = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const noStorage = !storage && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

test("4.21 · a post's design / video: a video only for a post, added, listed, removed; audited; sales 403", { skip: noStorage }, async () => {
  const id = await plan(rahma, "بوست بفيديو", 600);
  // the smallest mp4 header: a box whose type at bytes 4–8 is «ftyp»
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(12)]);
  const video = { name: `ريلز ${stamp}.mp4`, mime: "video/mp4", size: MP4.length };
  assert.equal((await call("/files/uploads", { method: "POST", cookie: rahma, body: video })).status, 400); // a video only for a post
  assert.equal((await call("/files/uploads", { method: "POST", cookie: rahma, body: { ...video, size: 201 * 1024 * 1024, purpose: "post" } })).status, 400);
  const t = await call("/files/uploads", { method: "POST", cookie: rahma, body: { ...video, purpose: "post" } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: MP4 })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: rahma })).status, 200);
  assert.equal((await call(`/marketing/posts/${id}/media`, { method: "POST", cookie: sales, body: { fileIds: [t.body.id] } })).status, 403);
  const added = await call(`/marketing/posts/${id}/media`, { method: "POST", cookie: rahma, body: { fileIds: [t.body.id] } });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal((await call(`/marketing/posts/${id}/media`, { method: "POST", cookie: rahma, body: { fileIds: [t.body.id] } })).status, 400); // already on it
  assert.equal((await call(`/marketing/posts/${id}/media`, { cookie: sales })).status, 403);
  const media = await call(`/marketing/posts/${id}/media`, { cookie: rahma });
  assert.deepEqual(media.body.map((m: { name: string; mime: string }) => [m.name, m.mime]), [[video.name, "video/mp4"]]);
  assert.ok(media.body[0].url && media.body[0].download);
  const row = (await call(`/marketing/posts`, { cookie: rahma })).body.find((p: { id: string }) => p.id === id);
  assert.equal(row?.media ?? 1, 1);
  assert.equal((await call(`/marketing/posts/${id}/media/${t.body.id}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/marketing/posts/${id}/media/${t.body.id}`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.deepEqual((await call(`/marketing/posts/${id}/media`, { cookie: rahma })).body, []);
  assert.equal(await prisma.file.count({ where: { id: t.body.id } }), 0);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "Post", entityId: id, action: { startsWith: "media" } }, orderBy: { at: "asc" } })).map((a) => a.action), ["media-add", "media-delete"]);
});
