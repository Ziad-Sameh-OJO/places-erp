/**
 * 12.11 · M-14 5.1 · 5.3: the bell is live — a notification written anywhere (the API or the worker, here straight
 * into the table like the worker does) reaches that person's open stream at once, and nobody else's — and the bell
 * filters by type and unread.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = Date.now();
let sales: string, hr: string, salesId: string;

before(async () => {
  [sales, hr] = await Promise.all([session("m.mohsen@places.com"), session("basant.elsawy@places.com")]);
  salesId = (await prisma.user.findUniqueOrThrow({ where: { email: "m.mohsen@places.com" } })).id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.$disconnect();
});

/**
 * Opens the event stream, writes a notification, and tells whether that one (by id) arrived within `ms`. Other test
 * files notify the same people at the same time, so only our own id counts.
 */
async function heard(cookie: string, ms: number, write: () => Promise<{ id: string }>): Promise<boolean> {
  const ctrl = new AbortController();
  const res = await fetch(`${API}/notifications/stream`, { headers: { cookie }, signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = res.body!.getReader();
  let id = "";
  let text = "";
  const got = (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return false;
      text += new TextDecoder().decode(value);
      if (id && text.includes(`"id":"${id}"`)) return true;
    }
  })();
  await new Promise((r) => setTimeout(r, 300)); // the stream is subscribed
  id = (await write()).id;
  if (text.includes(`"id":"${id}"`)) { ctrl.abort(); return true; } // it came before the insert returned
  const timer = new Promise<boolean>((r) => setTimeout(() => r(false), ms));
  const result = await Promise.race([got, timer]);
  ctrl.abort();
  return result;
}

test("the bell's stream: signed in only; a new notification reaches its owner at once, not anyone else", async () => {
  assert.equal((await fetch(`${API}/notifications/stream`)).status, 401);
  const write = () => prisma.notification.create({ data: { userId: salesId, text: `E2E ${stamp} لحظي`, event: "lead.visit_due" } });
  const started = Date.now();
  assert.equal(await heard(sales, 5_000, write), true, "the salesperson's open page heard of it");
  assert.ok(Date.now() - started < 5_000);
  assert.equal(await heard(hr, 1_500, write), false, "HR's page heard nothing of it");
});

test("the bell filters by type and unread; the types I have are listed (M-14 5.3)", async () => {
  await prisma.notification.createMany({ data: [
    { userId: salesId, text: `E2E ${stamp} تذكرة`, event: "ticket.late" },
    { userId: salesId, text: `E2E ${stamp} قديم`, event: "ticket.late", readAt: new Date() },
    { userId: salesId, text: `E2E ${stamp} ليد`, event: "lead.assigned" },
  ] });
  const r = await call("/notifications?event=ticket.late&pageSize=100", { cookie: sales });
  assert.equal(r.status, 200);
  const mine = r.body.items.filter((n: { text: string }) => n.text.includes(`E2E ${stamp}`));
  assert.deepEqual(mine.map((n: { text: string }) => n.text).sort(), [`E2E ${stamp} تذكرة`, `E2E ${stamp} قديم`].sort());
  assert.ok(r.body.items.every((n: { event: string }) => n.event === "ticket.late"));
  assert.ok(r.body.types.includes("ticket.late") && r.body.types.includes("lead.assigned"));
  const unread = (await call("/notifications?event=ticket.late&unread=true&pageSize=100", { cookie: sales })).body.items;
  assert.ok(unread.every((n: { readAt: string | null }) => n.readAt === null));
  assert.ok(unread.some((n: { text: string }) => n.text === `E2E ${stamp} تذكرة`));
  // someone else's types aren't mine
  assert.ok(!(await call("/notifications?event=ticket.late&pageSize=100", { cookie: hr })).body.items.some((n: { text: string }) => n.text.includes(`E2E ${stamp}`)));
  assert.equal((await call(`/notifications?event=${"x".repeat(61)}`, { cookie: sales })).status, 400);
});
