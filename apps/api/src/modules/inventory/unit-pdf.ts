import type { UnitDetail } from "@places/contracts";
import { UNIT_SHEET_FIELDS } from "@places/domain";
import { esc, layout } from "../../core/documents/documents.service";

/** A photo inlined as a data URL (FilesService.dataUrl): a PDF never fetches anything. */
export type Photo = string;
const dataUrl = (p: Photo) => esc(p);

// only the number is left-to-right: «ج.م» inside an LTR run would come out as «م.ج»
const num = (v: string | number) => `<span class="num">${esc(typeof v === "number" ? v.toLocaleString("en-US") : v)}</span>`;
const money = (v: string | null) => (v ? `${num(Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }))} ج.م` : "—");
const GRADIENT: Record<string, string> = { Rent: "#0a1f8f, #2c5cff", Resale: "#3a1c8f, #6a3df0", Income: "#04533b, #08875c", Primary: "#7a4b00, #c98a12" };

/** One value of the client-facing sheet (domain UNIT_SHEET_FIELDS), as the inventory list shows it. */
function value(u: UnitDetail, key: string): string {
  const d = u.details;
  switch (key) {
    // the client's slide: «20 SQM Up TO 690 SQM» for a unit that splits (2.21)
    case "space": return !u.space ? "—" : u.divisible && u.minSplit ? `${num(u.minSplit)} UP TO ${num(u.space)} م` : `${num(u.space)} م`;
    case "parking": return num(u.parking);
    case "pricePerSqm": return money(u.pricePerSqm);
    case "total": return money(u.totalPrice);
    case "monthly": return money(u.income?.monthlyRent ?? null);
    case "annual": return money(u.income?.annualRent ?? null);
    case "yield": return u.income?.yieldPct != null ? `${num(u.income.yieldPct.toFixed(2))}%` : "—";
    case "escalationPct": return d.escalationPct != null ? `${num(String(d.escalationPct))}%` : "—";
    case "delivery": case "contractDuration": case "endsOn": case "upfront": case "security": case "payment": case "term": case "grace": return esc(d[key] ?? "—");
    default: return esc((u as unknown as Record<string, unknown>)[key] || "—");
  }
}

/** The headline the demo's slide shows: area · floor · space · finishing, and the total («/ شهر» for rent). */
const headline = (u: UnitDetail) => `${esc(u.area)} · الدور ${esc(u.floor || "—")} · ${num(u.space)} م · ${esc(u.condition)}`;
const price = (u: UnitDetail) => `${money(u.totalPrice)}${u.type === "Rent" ? " / شهر" : ""}`;

/** M-03 2.2 · the unit's PDF (A4): the slide's headline, the main photos and the type's sheet without the owner. */
export function unitSheet(u: UnitDetail, photos: Photo[]): string {
  const rows = UNIT_SHEET_FIELDS[u.type].map(([k, label]) => `<tr><th>${esc(label)}</th><td>${value(u, k)}</td></tr>`).join("");
  const pics = photos.map((p) => `<img src="${dataUrl(p)}" alt="">`).join("");
  return layout(`${u.code} · ${u.project}`, `
    <style>.eyebrow{color:#2c5cff;font-size:10pt;letter-spacing:.04em}.price{font-size:16pt;font-weight:700}
    .pics{display:grid;grid-template-columns:repeat(2,1fr);gap:6pt;margin:10pt 0}.pics img{width:100%;height:150pt;object-fit:cover;border-radius:6pt}
    .pics img:first-child{grid-column:1/-1;height:230pt}</style>
    <div class="eyebrow">PLACES · ${esc(u.type)} · <span class="num">${esc(u.code)}</span></div>
    <h1>${esc(u.project)}</h1>
    <p>${headline(u)}</p>
    <p class="price">${price(u)}</p>
    ${pics ? `<div class="pics">${pics}</div>` : ""}
    <table><tbody>${rows}</tbody></table>
    ${u.divisible ? `<p>تنفع تتقسم${u.minSplit ? ` · أقل مساحة ${num(u.minSplit)} م` : ""}${u.splitNote ? ` · ${esc(u.splitNote)}` : ""}</p>` : ""}`);
}

/** The demo's slide (`.slide`): the main photo on one side, the headline and the price on the other, 16:9. */
export function unitSlide(u: UnitDetail, photo: Photo | null): string {
  const img = photo ? `<img src="${dataUrl(photo)}" alt="">` : "";
  return layout(`${u.code} · ${u.project}`, `
    <style>@page{size:1280px 720px;margin:0}html,body{width:1280px;height:720px;overflow:hidden}
    .slide{width:1280px;height:720px;display:grid;grid-template-columns:1.1fr 1fr;background:#0b1640;color:#fff}
    .s-img{background:linear-gradient(135deg, ${GRADIENT[u.type] ?? GRADIENT.Rent});position:relative}.s-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .s-txt{padding:60px;display:flex;flex-direction:column;justify-content:center;gap:14px}.eyebrow{color:#9fb4ff;font-size:20px}
    h3{font-size:46px;margin:0;line-height:1.25}p{margin:0;color:#c9d2ff;font-size:24px}b{font-size:40px}small{color:#9fb4ff;font-size:20px}</style>
    <div class="slide"><div class="s-img">${img}</div><div class="s-txt">
      <span class="eyebrow">PLACES · ${esc(u.type)}</span><h3>${esc(u.project)}</h3><p>${headline(u)}</p><b>${price(u)}</b><small><span class="num">${esc(u.code)}</span></small>
    </div></div>`);
}
