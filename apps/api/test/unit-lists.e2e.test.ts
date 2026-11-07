/**
 * M-03 6.1 «list of options as pdf» against the real API: the picked units in one file for a client — a list cover, each
 * unit's own pages, contacts and thank you once — as the full deck or the slide, PDF or PowerPoint. Every unit is checked
 * the way its own PDF is: a draft is for the inventory team only (Q15), so it stops a salesperson's list.
 * Manar = inventory (approve), Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const P = `E2E ${Date.now()} LIST`;
let manar: string, sales: string, hr: string, agentId: string;
const ids: string[] = [];

before(async () => {
  [manar, sales, hr] = await Promise.all(["manar.ahmed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  for (const [project, space] of [[`${P} Mivida`, 95], [`${P} Waterway`, 150]] as const) {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body: {
      type: "Rent", project, area: "التجمع الخامس", space, condition: "متشطب", parking: 1, agentId, pricePerSqm: "1100",
    } });
    assert.equal(r.status, 201);
    ids.push((r.body as { id: string }).id);
  }
  // the first goes to the sales (Manar's confirm); the second stays a draft
  assert.equal((await call(`/inventory/units/${ids[0]}/pdf/confirm`, { method: "POST", cookie: manar })).status, 204);
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { project: { startsWith: P } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

const list = (cookie: string, body: object) => fetch(`${API}/inventory/unit-lists`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());
/** a PDF's pages: Chromium writes one «/Type /Page» object each */
const pages = (b: Buffer) => b.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0;
/** a .pptx (a ZIP): its entries by name, read from the central directory and inflated */
function pptx(b: Buffer): Map<string, string> {
  const end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50, "a ZIP");
  let at = b.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = b.readUInt16LE(end + 10); i > 0; i--) {
    const len = b.readUInt16LE(at + 28), size = b.readUInt32LE(at + 20), local = b.readUInt32LE(at + 42), name = b.toString("utf8", at + 46, at + 46 + len);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
    out.set(name, (b.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8"));
    at += 46 + len + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32);
  }
  return out;
}
const slides = (z: Map<string, string>) => [...z.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;

test("the inventory team puts several units in one List of options: full or short, PDF or PowerPoint", async () => {
  // full, no photos: list cover · per unit (cover · building · specs · one interior) · contacts · thank you
  const full = await list(manar, { unitIds: ids, kind: "pdf", format: "pdf", client: "ACME" });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "application/pdf");
  assert.equal(decodeURIComponent(full.headers.get("content-disposition") ?? ""), "inline; filename*=UTF-8''List of options - ACME.pdf");
  assert.equal(pages(await bytes(full)), 1 + 2 * 4 + 2);
  // short: list cover · per unit (specs · «Interior picture») · contacts · thank you
  const short = await list(manar, { unitIds: ids, kind: "slide", format: "pdf" });
  assert.equal(short.status, 200);
  assert.match(decodeURIComponent(short.headers.get("content-disposition") ?? ""), /List of options \(2 units\)\.pdf$/);
  assert.equal(pages(await bytes(short)), 1 + 2 * 2 + 2);
  // PowerPoint: the same pages; the cover names the client; the units in the order picked; no commission or owner
  const pp = await list(manar, { unitIds: [ids[1], ids[0]], kind: "pdf", format: "pptx", client: "ACME" });
  assert.equal(pp.status, 200);
  assert.match(decodeURIComponent(pp.headers.get("content-disposition") ?? ""), /^attachment; .*List of options - ACME\.pptx$/);
  const z = pptx(await bytes(pp));
  assert.equal(slides(z), 11);
  assert.match(z.get("ppt/slides/slide1.xml") ?? "", /LIST OF OPTIONS.*2 UNITS.*PREPARED FOR : ACME/s);
  assert.match(z.get("ppt/slides/slide2.xml") ?? "", /WATERWAY/, "the order picked");
  assert.match(z.get("ppt/slides/slide6.xml") ?? "", /MIVIDA/);
  assert.doesNotMatch([...z.values()].join(""), /Commission/);
});

test("a salesperson lists only units they may see; HR can't; the list is checked", async () => {
  // the draft stops the sales' list (Q15), the confirmed one goes
  assert.equal((await list(sales, { unitIds: ids, kind: "slide", format: "pdf" })).status, 404);
  const ok = await list(sales, { unitIds: [ids[0]], kind: "slide", format: "pdf" });
  assert.equal(ok.status, 200);
  assert.equal(pages(await bytes(ok)), 1 + 2 + 2);
  // no inventory permission
  assert.equal((await list(hr, { unitIds: [ids[0]], kind: "pdf", format: "pdf" })).status, 403);
  // nothing picked, the same unit twice, more than 20, an unknown shape
  for (const body of [{ unitIds: [], kind: "pdf", format: "pdf" }, { unitIds: [ids[0], ids[0]], kind: "pdf", format: "pdf" },
    { unitIds: Array.from({ length: 21 }, (_, i) => `c${String(i).padStart(24, "0")}`), kind: "pdf", format: "pdf" }, { unitIds: [ids[0]], kind: "deck", format: "pdf" }]) {
    assert.equal((await list(manar, body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
});
