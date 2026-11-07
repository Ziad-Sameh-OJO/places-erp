/** Display helpers with the demo's formats (demo js/app.js: num, money, short, ago), in the page's language. */
import { currentLocale } from "./locale";

const en = () => currentLocale() === "en";
/** Dates in Arabic as the demo shows them; English as day-month («4 Nov»), Cairo time either way. */
export const dateLocale = () => (en() ? "en-GB" : "ar-EG");
export const egp = () => (en() ? "EGP" : "ج.م");

const nf = new Intl.NumberFormat("en-US");
export const num = (n: number) => nf.format(Math.round(n));

/** Money comes as a decimal string («120000.00»): group the whole pounds as text, no float maths. */
export const money = (s: string | null) => (s == null ? "—" : `${s.split(".")[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${egp()}`);

/** Money with its piasters when it has some («3151.50» → «3,151.50 ج.م», «104500.00» → «104,500 ج.م»): a unit's total. */
export const moneyExact = (s: string | null) => (s == null ? "—" : `${amount(s)} ${egp()}`);

/** «120K», «1.25M» for the Kanban cards. A rounded label only, never used in a calculation. */
export function short(s: string | null) {
  if (s == null) return "—";
  const n = Number(s), a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "")}M`;
  return a >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
}

export function ago(iso: string, now = Date.now()) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (en()) return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
  if (m < 1) return "دلوقتي";
  if (m < 60) return `من ${m} د`;
  if (m < 1440) return `من ${Math.floor(m / 60)} س`;
  return `من ${Math.floor(m / 1440)} يوم`;
}


/** A decimal string as a grouped number without the currency («1100.50» → «1,100.50», «104500.00» → «104,500»): the sheet's price per m². */
export function amount(s: string | null | undefined) {
  if (s == null) return "—";
  const [whole, frac] = s.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac && Number(frac) ? `${grouped}.${frac}` : grouped;
}

/**
 * The demo's short date («4 نوفمبر»), with the year when it isn't this year. An instant is shown as its Cairo day;
 * a calendar day «YYYY-MM-DD» as itself.
 */
export function day(value: string | null | undefined, now = new Date()) {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const year = (x: Date) => x.toLocaleDateString("en-US", { timeZone: "Africa/Cairo", year: "numeric" });
  return d.toLocaleDateString(dateLocale(), { timeZone: "Africa/Cairo", day: "numeric", month: "short", ...(year(d) !== year(now) ? { year: "numeric" } : {}) });
}

/** The demo's date and time on a timeline line (fmtDate + fmtTime): «٤ نوفمبر ٩:١٥ م», Cairo time. */
export const dayTime = (iso: string) => `${day(iso)} ${new Date(iso).toLocaleTimeString(dateLocale(), { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" })}`;
