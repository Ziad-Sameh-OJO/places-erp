/** Display helpers with the demo's formats (demo js/app.js: num, money, short, ago). */

const nf = new Intl.NumberFormat("en-US");
export const num = (n: number) => nf.format(Math.round(n));

/** Money comes as a decimal string («120000.00»): group the whole pounds as text, no float maths. */
export const money = (s: string | null) => (s == null ? "—" : `${s.split(".")[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ج.م`);

/** «120K», «1.25M» for the Kanban cards. A rounded label only, never used in a calculation. */
export function short(s: string | null) {
  if (s == null) return "—";
  const n = Number(s), a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "")}M`;
  return a >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
}

export function ago(iso: string, now = Date.now()) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "دلوقتي";
  if (m < 60) return `من ${m} د`;
  if (m < 1440) return `من ${Math.floor(m / 60)} س`;
  return `من ${Math.floor(m / 1440)} يوم`;
}

/** 150 → «ساعتين ونص», 180 → «3 ساعات», 1320 → «22 ساعة» (the SLA note under the leads list). */
export function hoursText(minutes: number) {
  const h = Math.floor(minutes / 60), rest = minutes % 60;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  if (!h) return `${minutes} دقيقة`;
  return rest === 0 ? hours : rest === 30 ? `${hours} ونص` : `${hours} و${rest} دقيقة`;
}
