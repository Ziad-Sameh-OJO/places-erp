import { esc, layout } from "../../core/documents/documents.service";
import type { ClientListUnit } from "../inventory/inventory.service";

// only the number is left-to-right: «ج.م» inside an LTR run would come out as «م.ج»
const egp = (decimal: string) => `<span class="num">${Number(decimal.split(".")[0]).toLocaleString("en-US")}</span> ج.م`;
const day = (d: Date) => d.toLocaleDateString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", dateStyle: "long" });

/**
 * The client's «List of options» (2.13, M-01 6.1 · M-03 6.1), as the demo's PDF: Places, the client and the day, then
 * each unit's project, code, area, floor, space, finishing and price (a Rent's price is a month's rent).
 */
export function unitListHtml(client: string, units: ClientListUnit[], now: Date): string {
  const rows = units.map((u) => `<tr>
    <td><b>${esc(u.project)}</b> · <span class="num">${esc(u.code)}</span><br><small>${esc(u.area)} · الدور ${esc(u.floor || "—")} · <span class="num">${u.space}</span> م${u.splitOf ? ` (جزء من <span class="num">${u.splitOf}</span> م)` : ""} · ${esc(u.condition)} · Parking <span class="num">${u.parking}</span></small></td>
    <td>${u.totalPrice ? egp(u.totalPrice) : "—"}${u.totalPrice && u.type === "Rent" ? " / شهر" : ""}</td>
  </tr>`).join("");
  return layout(`List of options · ${client}`, `
    <style>small { color: #6b7489; } .head { border-bottom: 2px solid #0037ff; padding-bottom: 8pt; margin-bottom: 8pt; } td:last-child { white-space: nowrap; }</style>
    <div class="head"><h1>Places · List of options</h1><div>لـ ${esc(client)} · ${esc(day(now))}</div></div>
    <table><thead><tr><th>الوحدة</th><th>السعر</th></tr></thead><tbody>${rows}</tbody></table>`);
}

/** The comment on the lead (M-03 6.1: «تم ارسال الوحدات التالية … المساحة و البروجكت لكل مساحة حددها»), the demo's words. */
export const unitListLine = (units: ClientListUnit[]): string =>
  `تم إرسال الوحدات التالية للعميل (PDF): ${units.map((u) => `${u.code} (${u.project} · ${u.space} م${u.splitOf ? ` من ${u.splitOf} م` : ""})`).join("، ")}`;
