import type { UnitDetail } from "@places/contracts";
import { UNIT_SHEET_FIELDS } from "@places/domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PptxGenJS from "pptxgenjs";
import { esc, layout } from "../../core/documents/documents.service";

/**
 * 2.23 · the unit's PDF and slide in the client's design (P1901 and slide.pptx, 2026-11-05; the demo's brochure.js): a
 * fixed brand frame (red cover, dark photo pages, paper spec page, contacts, thank you) filled from the unit's sheet and
 * its Pic & Info photos — the first photo is the building, the rest are inside. The same pages draw the 16:9 PDF
 * (Chromium) and the PowerPoint (pptxgenjs).
 */

/** A photo inlined as a data URL (FilesService.dataUrl): a PDF never fetches anything. */
export type Photo = string;
type Bg = "red" | "paper" | "dark" | "contacts";
/** a photo box: [photo or none, x, y, w, h] in % of the page */
type Box = [Photo | null, number, number, number, number];
type Row = [label: string, value: string, mark?: "area" | "rate"];
interface Page { bg: Bg; cover?: { title: string; area: string; building: string; code: string }; photos?: Box[]; title?: string; table?: Row[]; thanks?: boolean }

// the backgrounds come from the client's pptx (copied to the build by nest-cli.json), read once
let bgs: Record<Bg, string> | undefined;
const bg = (k: Bg) => (bgs ??= Object.fromEntries((["red", "paper", "dark", "contacts"] as const).map((b) =>
  [b, `data:image/jpeg;base64,${readFileSync(join(__dirname, "brochure", b === "contacts" ? "contacts.jpg" : `bg-${b}.jpg`)).toString("base64")}`])) as Record<Bg, string>)[k];

const COND: Record<string, string> = { "متشطب": "Finished", "نص تشطيب": "Semi finished" };
// the client's placeholder text until they send theirs (asked on the PR)
const DISCLAIMER = "This presentation is for information only and does not form an offer or a contract. Areas, prices and terms are as provided by the owner on the date of issue and may change without notice.";
const dash = (v: unknown) => (v == null || v === "" || v === 0 ? "—" : String(v));
const n = (v: number) => v.toLocaleString("en-US");
const egp = (v: string | null | undefined) => (v && Number(v) ? `EGP ${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—");
/** «20 SQM Up TO 690 SQM» for a unit that splits (2.21) */
const areaText = (u: UnitDetail) => (!u.space ? "—" : u.divisible && u.minSplit ? `${n(u.minSplit)} SQM Up TO ${n(u.space)} SQM` : `${n(u.space)} SQM`);

/** One value of the spec table (domain UNIT_SHEET_FIELDS); «—» when it's empty. */
function value(u: UnitDetail, key: string): string {
  const d = u.details;
  switch (key) {
    case "space": return areaText(u);
    case "condition": return dash(COND[u.condition] ?? u.condition);
    case "pricePerSqm": return egp(u.pricePerSqm);
    case "total": return egp(u.totalPrice);
    case "monthly": return egp(u.income?.monthlyRent);
    case "annual": return egp(u.income?.annualRent);
    case "yield": return u.income?.yieldPct != null ? `${u.income.yieldPct.toFixed(1)}%` : "—";
    case "escalationPct": return d.escalationPct != null ? `${d.escalationPct}%` : "—";
    default: return dash(key in d ? d[key] : (u as unknown as Record<string, unknown>)[key]);
  }
}

const rows = (u: UnitDetail): Row[] => UNIT_SHEET_FIELDS[u.type].map(([k, label]) => [label, value(u, k), k === "space" ? "area" : k === "pricePerSqm" ? "rate" : undefined]);
const headline = (u: UnitDetail) => (u.type === "Rent" ? "NEW OFFICE AVAILABLE FOR LEASING" : u.type === "Income" ? "INCOME PROPERTY FOR SALE" : "NEW OFFICE AVAILABLE FOR SALE");

/** «pdf» = cover · building · specs · one interior per page · contacts · thank you; «slide» = specs + «Interior picture» two a page. */
function pages(u: UnitDetail, photos: Photo[], kind: "pdf" | "slide"): Page[] {
  const [front = null, ...inside] = photos;
  const spec: Page = { bg: "paper", photos: [[front, 3.3, 19, 44.2, 45.4]], table: rows(u) };
  if (kind === "pdf") return [
    { bg: "red", cover: { title: headline(u), area: areaText(u).toUpperCase(), building: `BUILDING NAME : ${dash(u.project).toUpperCase()}`, code: `CODE:${u.code}` } },
    { bg: "dark", photos: [[front, 2.5, 4, 95, 84]] },
    spec,
    ...(inside.length ? inside : [null]).map((p): Page => ({ bg: "dark", photos: [[p, 2.5, 4, 95, 84]] })),
    { bg: "contacts" }, { bg: "red", thanks: true },
  ];
  const two: (Photo | null)[] = inside.length ? inside : [null, null];
  const P = [spec];
  for (let i = 0; i < two.length; i += 2) {
    P.push({ bg: "paper", title: "Interior picture", photos: [[two[i] ?? null, 3.1, 20.4, 44.4, 44.4], ...(i + 1 < two.length ? [[two[i + 1] ?? null, 51.2, 20.4, 44.4, 44.4] as Box] : [])] });
  }
  return P;
}

/** The client's file name: «(P1901) Gate Way El Rehab 20M Up TO 690M»; the slide «P1901 slide». */
export const deckName = (u: UnitDetail, kind: "pdf" | "slide") => (kind === "pdf" ? `(${u.code}) ${u.project} ${areaText(u).replace(/ SQM/g, "M")}` : `${u.code} slide`);

/* ---------- the PDF (Chromium, 1280 × 720 pages) ---------- */
const SANS = "Arial, Arimo, 'Liberation Sans', 'IBM Plex Sans Arabic', sans-serif", SERIF = "'Times New Roman', Tinos, 'Liberation Serif', 'IBM Plex Sans Arabic', serif";
const CSS = `@page{size:1280px 720px;margin:0}
  .b-pg{position:relative;width:1280px;height:720px;background-size:cover;background-position:center;overflow:hidden;font-family:${SANS};color:#fff;direction:ltr;text-align:left;line-height:1.2}
  .b-pg+.b-pg{break-before:page}
  .b-cover{position:absolute;left:1.9%;top:5.3%;right:4%}.b-cover h1{font:700 54px/1.02 ${SANS};margin:0;max-width:640px}.b-cover h2{font:700 44px/1.1 ${SANS};margin:6px 0 0}
  .b-meta{position:absolute;top:255px;left:0;right:8%;display:flex;justify-content:space-between;font:700 18px ${SANS}}
  .b-ph{position:absolute;overflow:hidden;background:rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}.b-ph img{width:100%;height:100%;object-fit:cover;display:block}.b-ph span{font:italic 20px ${SERIF};color:#8a8579}
  .b-tbl{position:absolute;left:50%;top:5.5%;width:47.5%;margin:0;border-collapse:collapse;font:22px/1.2 ${SERIF};color:#1d1d1b}
  .b-tbl td{border:1.5px solid #9b9b9b;padding:0 14px;height:35px;background:rgba(232,229,224,.55);text-align:left}.b-tbl td:first-child{width:50%}
  .b-tbl tr:nth-child(even) td{background:rgba(160,160,160,.5)}
  .b-tbl tr.area td{background:#a7a7a7;color:#e5372b;font-weight:700}.b-tbl tr.rate td{background:#ee3a4f;color:#fff;font-weight:700}
  .b-title{position:absolute;left:37.5%;top:4.6%;width:25%;margin:0;text-align:center;font:400 34px ${SERIF};color:#1d1d1b}
  .b-thanks{position:absolute;left:1.8%;top:3.5%;font:60px 'Book Antiqua',Palatino,${SERIF}}
  .b-site{position:absolute;left:49.4%;top:80.4%;font:20px 'Book Antiqua',Palatino,${SERIF}}.b-disc{position:absolute;left:49.4%;top:86.2%;width:46%;margin:0;font:8px/1.3 'Book Antiqua',Palatino,${SERIF};opacity:.9}`;

const box = ([src, x, y, w, h]: Box) => `<div class="b-ph" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%">${src ? `<img src="${esc(src)}" alt="">` : "<span>Photos coming soon</span>"}</div>`;
const pageHtml = (p: Page) => `<section class="b-pg" style="background-image:url('${esc(bg(p.bg))}')">
  ${p.cover ? `<div class="b-cover"><h1>${esc(p.cover.title)}</h1><h2>${esc(p.cover.area)}</h2><div class="b-meta"><span>${esc(p.cover.building)}</span><span>${esc(p.cover.code)}</span></div></div>` : ""}
  ${(p.photos ?? []).map(box).join("")}
  ${p.title ? `<h3 class="b-title">${esc(p.title)}</h3>` : ""}
  ${p.table ? `<table class="b-tbl">${p.table.map(([l, v, mark]) => `<tr class="${mark ?? ""}"><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
  ${p.thanks ? `<div class="b-thanks">Thank you</div><div class="b-site">Places-egy.com</div><p class="b-disc">${esc(DISCLAIMER)}</p>` : ""}
</section>`;

/** The deck as HTML for DocumentsService.pdf(…, { slide: true }). */
export const unitDeckHtml = (u: UnitDetail, photos: Photo[], kind: "pdf" | "slide") =>
  layout(deckName(u, kind), `<style>${CSS}</style>${pages(u, photos, kind).map(pageHtml).join("")}`);

/* ---------- PowerPoint (13.333 × 7.5 in) ---------- */

/** A PNG's or JPEG's pixel size: PowerPoint crops a photo to its box only knowing it. Null = stretched into the box. */
function pixels(src: Photo): { w: number; h: number } | null {
  const b = Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  // walk the JPEG's segments to its frame header (SOF0…SOF15, not DHT / JPG / DAC)
  for (let i = 2; i + 9 < b.length && b[i] === 0xff; i += 2 + b.readUInt16BE(i + 2)) {
    const m = b[i + 1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
  }
  return null;
}

/** The same pages as a .pptx (the demo's unitDeckPptx, server-side). */
export async function unitDeckPptx(u: UnitDetail, photos: Photo[], kind: "pdf" | "slide"): Promise<Buffer> {
  const X = (v: number) => (v * 13.333) / 100, Y = (v: number) => (v * 7.5) / 100;
  const ppt = new PptxGenJS();
  ppt.layout = "LAYOUT_WIDE";
  ppt.title = deckName(u, kind);
  for (const p of pages(u, photos, kind)) {
    const s = ppt.addSlide();
    s.background = { data: bg(p.bg) };
    for (const [src, x, y, w, h] of p.photos ?? []) {
      if (!src) {
        s.addText("Photos coming soon", { x: X(x), y: Y(y), w: X(w), h: Y(h), align: "center", fontFace: "Times New Roman", italic: true, color: "8A8579", fill: { color: "E8E5E0" } });
        continue;
      }
      const px = pixels(src);
      // pptxgenjs crops «cover» from the w / h it's given, so they carry the photo's own proportions
      s.addImage({ data: src, x: X(x), y: Y(y), w: X(w), h: px ? (X(w) * px.h) / px.w : Y(h), sizing: { type: "cover", w: X(w), h: Y(h) } });
    }
    if (p.cover) {
      s.addText([{ text: p.cover.title, options: { fontSize: 54, breakLine: true } }, { text: p.cover.area, options: { fontSize: 44 } }], { x: X(1.9), y: Y(5.3), w: X(55), h: Y(44), fontFace: "Arial", bold: true, color: "FFFFFF", valign: "top", lineSpacingMultiple: 0.9 });
      s.addText(p.cover.building, { x: X(1.9), y: Y(52), w: X(50), h: Y(6), fontFace: "Arial", bold: true, fontSize: 18, color: "FFFFFF" });
      s.addText(p.cover.code, { x: X(55), y: Y(52), w: X(35), h: Y(6), fontFace: "Arial", bold: true, fontSize: 18, color: "FFFFFF" });
    }
    if (p.title) s.addText(p.title, { x: X(37.5), y: Y(4.6), w: X(25), h: Y(7.6), align: "center", fontFace: "Times New Roman", fontSize: 28, color: "1D1D1B" });
    if (p.table) {
      s.addTable(p.table.map(([l, v, mark], i) => [l, v].map((text) => ({ text, options: {
        bold: !!mark, color: mark === "rate" ? "FFFFFF" : mark === "area" ? "E5372B" : "1D1D1B",
        fill: { color: mark === "rate" ? "EE3A4F" : mark === "area" ? "A7A7A7" : i % 2 ? "C4C4C4" : "E8E5E0" },
      } }))), { x: X(50), y: Y(5.5), w: X(47.5), colW: [X(23.75), X(23.75)], fontFace: "Times New Roman", fontSize: 14, border: { type: "solid", pt: 1, color: "9B9B9B" }, rowH: 0.36 });
    }
    if (p.thanks) {
      s.addText("Thank you", { x: X(1.8), y: Y(3.5), w: X(40), h: Y(13.5), fontFace: "Book Antiqua", fontSize: 60, color: "FFFFFF" });
      s.addText("Places-egy.com", { x: X(49.4), y: Y(80.4), w: X(30), h: Y(5.8), fontFace: "Book Antiqua", fontSize: 20, color: "FFFFFF" });
      s.addText(DISCLAIMER, { x: X(49.4), y: Y(86.2), w: X(46), h: Y(8), fontFace: "Book Antiqua", fontSize: 7, color: "FFFFFF", valign: "top" });
    }
  }
  return (await ppt.write({ outputType: "nodebuffer" })) as Buffer;
}
