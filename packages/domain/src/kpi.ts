/**
 * M-12 · KPI cards (client file Places_KPIs_Q4_2026 + answers of 28/10).
 * Each item is scored proportionally and may pass 100% (recorded as is). The card score = Σ weight × achievement.
 * The money bands (salary or quarter bonus, per person) are the same for everyone and editable in settings.
 */
import { PLACES_CALENDAR, type WorkCalendar, dayStart, localDate } from "./business-time.ts";

/** Where an item's number comes from (meeting 4 Nov): the system measures it, a report is handed in, or a person types it. */
export type Method = "system" | "report" | "manual";
export type Direction = "at-least" | "at-most";

export interface KpiItem {
  readonly title: string;
  /** weight in percent; a card's weights add up to 100 */
  readonly weight: number;
  readonly direction: Direction;
  readonly goal: number;
  readonly method: Method;
}

/**
 * Achievement of one item as a fraction (1 = 100%).
 * at-least: actual ÷ goal, uncapped. at-most: met = 1, over → goal ÷ actual; a "zero" goal loses 25% per occurrence.
 */
export function achievement(item: Pick<KpiItem, "direction" | "goal">, actual: number): number {
  if (item.direction === "at-least") return item.goal > 0 ? actual / item.goal : 1;
  if (actual <= item.goal) return 1;
  return item.goal > 0 ? item.goal / actual : Math.max(0, 1 - 0.25 * actual);
}

/** Card score in percent, e.g. 92.5. */
export function cardScore(items: ReadonlyArray<KpiItem & { readonly actual: number }>): number {
  return items.reduce((sum, it) => sum + it.weight * achievement(it, it.actual), 0);
}

export const weightsAreValid = (items: readonly Pick<KpiItem, "weight">[]): boolean => items.reduce((s, it) => s + it.weight, 0) === 100;

export interface Bands {
  /** ≥ top: full bonus + reward% of it */
  readonly top: number;
  /** ≥ full: full bonus */
  readonly full: number;
  /** ≥ partial: partial bonus, the cut grows evenly from 0 at `full` to `cut`% at `partial` */
  readonly partial: number;
  /** below `partial`: cut% + improvement plan; below `low` (the Threshold): bonus cancelled + cut% of salary + written warning */
  readonly low: number;
  readonly rewardPercent: number;
  readonly cutPercent: number;
}
export const DEFAULT_BANDS: Bands = { top: 100, full: 96, partial: 70, low: 50, rewardPercent: 15, cutPercent: 15 };

export type BandName = "reward" | "full" | "partial" | "cut" | "threshold";
export const bandOf = (score: number, b: Bands = DEFAULT_BANDS): BandName =>
  score >= b.top ? "reward" : score >= b.full ? "full" : score >= b.partial ? "partial" : score >= b.low ? "cut" : "threshold";

export interface PaySetup {
  /** what the result moves: the monthly salary or the quarter bonus */
  readonly base: "salary" | "bonus";
  /** amount of that base, in piasters */
  readonly amount: number;
  /** monthly salary in piasters (used by the Threshold rule when the base is the bonus) */
  readonly monthlySalary: number;
}

/** Reward (+) or deduction (−) in piasters for a card score. */
export function payoutDelta(score: number, pay: PaySetup, b: Bands = DEFAULT_BANDS): number {
  const B = pay.amount;
  switch (bandOf(score, b)) {
    case "reward": return Math.round((B * b.rewardPercent) / 100);
    case "full": return 0;
    case "partial": return -Math.round(((B * b.cutPercent) / 100) * ((b.full - score) / (b.full - b.partial)));
    case "cut": return -Math.round((B * b.cutPercent) / 100);
    case "threshold": return pay.base === "bonus" ? -(B + Math.round((pay.monthlySalary * b.cutPercent) / 100)) : -Math.round((B * b.cutPercent) / 100);
  }
}

/** The tier in words (demo kpis.js `band`). */
export function bandLabel(score: number, b: Bands = DEFAULT_BANDS): string {
  switch (bandOf(score, b)) {
    case "reward": return `مكافأة ${b.rewardPercent}%`;
    case "full": return "بونص كامل";
    case "partial": return "بونص جزئي";
    case "cut": return `خصم ${b.cutPercent}% + خطة تحسين`;
    case "threshold": return `Threshold: البونص بيتلغي + خصم ${b.cutPercent}% من المرتب + إنذار`;
  }
}

/** 11.14: the same tier without a word about money, for the KPI watcher. */
export const levelLabel = (score: number, b: Bands = DEFAULT_BANDS): string =>
  score >= b.full ? "محقق" : score >= b.partial ? "محتاج متابعة" : score >= b.low ? "ضعيف · خطة تحسين" : "تحت الحد";

export const bandTone = (score: number, b: Bands = DEFAULT_BANDS): "ok" | "warn" | "bad" =>
  score >= b.full ? "ok" : score >= b.partial ? "warn" : "bad";

/** What one item counts toward its card: a report item is its hand-ins against the times required, the rest their value. */
export function itemAchievement(it: { method: Method; direction: Direction; goal: number; value: number | null; required: number | null; delivered: number }): number {
  return it.method === "report" ? achievement({ direction: "at-least", goal: it.required ?? 0 }, it.delivered) : achievement(it, it.value ?? 0);
}

/** "2026-Q4" → "2027-Q1" (11.11 «ابدأ ربع جديد»). */
export function nextQuarter(q: string): string {
  const [y, n] = q.split("-Q").map(Number) as [number, number];
  return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`;
}
export const quarterLabel = (q: string): string => q.replace(/^(\d+)-Q(\d)$/, "Q$2 $1");

/**
 * Who types a manual item (meeting 4 Nov): the names it lists — "follower" (the card's follower, the default), a role
 * key or a user id.
 */
export const canEnterManual = (enteredBy: readonly string[], who: { userId: string; roles: readonly string[]; isFollower: boolean }): boolean =>
  (enteredBy.length ? enteredBy : ["follower"]).some((x) => (x === "follower" ? who.isFollower : x === who.userId || who.roles.includes(x)));

/** "2026-Q4" → "2026-Q3": the quarter before, for «ربعين ورا بعض». */
export function previousQuarter(q: string): string {
  const [y, n] = q.split("-Q").map(Number) as [number, number];
  return n === 1 ? `${y - 1}-Q4` : `${y}-Q${n - 1}`;
}
/** 11.6 «نص الربع»: the 15th of the quarter's middle month ("2026-Q4" → "2026-11-15"). */
export function quarterMidpoint(q: string): string {
  const [y, n] = q.split("-Q").map(Number) as [number, number];
  return `${y}-${String(n * 3 - 1).padStart(2, "0")}-15`;
}

/**
 * 11.6 · what a closed quarter's result triggers (M-12 2.3): under `partial` the follower opens an improvement plan; under
 * `low` (the Threshold) also a written warning; under `low` two quarters in a row → HR review.
 */
export function closeAlert(score: number, previous: number | null, b: Bands = DEFAULT_BANDS): "plan" | "warning" | "hr" | null {
  if (score >= b.partial) return null;
  if (score >= b.low) return "plan";
  return previous != null && previous < b.low ? "hr" : "warning";
}

// ───────── 11.11 · the catalog of system metrics (demo kpis.js `META`) ─────────

export type MetricParam = "per" | "kind" | "avg" | "type" | "min" | "hours" | "excl" | "akind";
export type MetricParams = Readonly<Partial<Record<MetricParam, string | number>>>;
export interface MetricDef {
  readonly group: string;
  readonly label: string;
  readonly unit: "%" | "#";
  readonly params?: readonly MetricParam[];
  /** exactly what it's calculated from, in one sentence */
  readonly describe: (p: MetricParams) => string;
}

export const PERIODS = [["week", "آخر 7 أيام"], ["month", "الشهر ده"], ["quarter", "الربع ده"]] as const;
const perName = (p: MetricParams) => (PERIODS.find((x) => x[0] === (p.per || "quarter")) ?? PERIODS[2])[1];
const weekly = (p: MetricParams) => (p.avg === "week" ? " · متوسط في الأسبوع" : "");

/** Each setting a metric can take: its label and options (null = a number, "text" = free text). */
export const METRIC_PARAMS: Record<MetricParam, { label: string; options: readonly (readonly [string, string])[] | null | "text" }> = {
  per: { label: "الفترة", options: PERIODS },
  kind: { label: "النوع", options: [["", "الاتنين"], ["Visit", "Visit"], ["Meeting", "Meeting"]] },
  avg: { label: "العدد", options: [["", "الإجمالي"], ["week", "متوسط في الأسبوع"]] },
  type: { label: "نوع الوحدة", options: [["", "كل الأنواع"], ["Rent", "Rent"], ["Resale", "Resale"], ["Income", "Income"]] },
  min: { label: "خلال كام دقيقة", options: null },
  hours: { label: "خلال كام ساعة", options: null },
  excl: { label: "Channels مش محسوبة (افصل بينها بفاصلة)", options: "text" },
  akind: { label: "النشاط", options: [["", "الاتنين"], ["Farming", "Farming"], ["Approach", "Approach"]] },
};

export const METRICS: Readonly<Record<string, MetricDef>> = {
  ownTarget: { group: "المبيعات", label: "تحقيق التارجت", unit: "%", describe: () => "نصيبه من الكوميشن في الصفقات اللي دخلت التارجت ÷ التارجت بتاعه" },
  visitsDone: { group: "المبيعات", label: "Visits / Meetings اتعملت", unit: "#", params: ["kind", "per"], describe: (p) => `عدد الـ ${p.kind || "Visits والـ Meetings"} اللي اتعلّم عليها Done في ليدزه · ${perName(p)}` },
  calls: { group: "المبيعات", label: "المكالمات", unit: "#", params: ["per", "avg"], describe: (p) => `عدد المكالمات اللي سجّلها بنفسه على الليدز · ${perName(p)}${weekly(p)}` },
  unitsBrought: { group: "المبيعات", label: "وحدات جابها للانفنتوري", unit: "#", params: ["type", "per"], describe: (p) => `عدد الوحدات${p.type ? ` ${p.type}` : ""} اللي هو الـ Agent بتاعها ودخلت الانفنتوري · ${perName(p)}` },
  broadcasts: { group: "المبيعات", label: "الـ Broadcasts اللي بعتها", unit: "#", describe: () => "عدد رسايل الـ Broadcast المعتمدة اللي علّم إنه بعتها" },
  firstAction: { group: "المبيعات", label: "أول أكشن على الليد", unit: "%", params: ["min", "per"], describe: (p) => `% من ليدزه (${perName(p)}) اللي عمل عليها أول أكشن خلال ${p.min || 30} دقيقة من دخولها` },
  qualifiedRate: { group: "المبيعات", label: "نسبة الـ Qualified", unit: "%", params: ["per"], describe: (p) => `% من ليدزه (${perName(p)}) اللي وصلت Interested أو بعدها` },
  activitiesDone: { group: "المبيعات", label: "Farming / Approach اتعمل", unit: "#", params: ["akind", "per", "avg"], describe: (p) => `عدد نشاطات الـ ${p.akind || "Farming والـ Approach"} اللي سجّلها وعلّم إنه عملها · ${perName(p)}${weekly(p)}` },
  dailySum: { group: "التقرير اليومي", label: "اللي بيكتبه في التقرير اليومي", unit: "#", params: ["per", "avg"], describe: (p) => `مجموع الرقم اللي بيكتبه للبند ده في تقريره اليومي · ${perName(p)}${weekly(p)}` },
  dealsCount: { group: "المبيعات", label: "الصفقات", unit: "#", params: ["per"], describe: (p) => `عدد الصفقات اللي هو Buyer فيها (مش مرفوضة ولا ملغية) · ${perName(p)}` },
  teamTarget: { group: "المبيعات", label: "تارجت الفريق", unit: "%", describe: () => "تحقيق تارجت الفريق اللي بيقوده (للـ Team Leader)" },
  company: { group: "المبيعات", label: "تارجت الشركة", unit: "%", describe: () => "مجموع اللي حققه كل السيلز ÷ مجموع تارجتهم" },
  newLeadRoute: { group: "الليدز", label: "توزيع الـ New Lead في ميعاده", unit: "%", params: ["min", "per"], describe: (p) => `% من الـ New Leads اللي Telesales بعتتها (${perName(p)}) واتبعتت للسيلز خلال ${p.min || 30} دقيقة من وصولها · اللي لسه مستني وعدّى الـ ${p.min || 30} دقيقة بيتحسب متأخر` },
  secondCalls: { group: "الليدز", label: "مكالمات التحقق (Second Calls)", unit: "%", params: ["per", "excl"], describe: (p) => `% من ليدز كل يوم (${perName(p)}) اللي اتعملها Second Call Done بنوت في نفس اليوم · من غير الليدز اللي السيلز نزّلها بنفسه ولا Channel ${p.excl ?? "By Safwat"}` },
  draftAction: { group: "الليدز", label: "قرارات الـ Draft في ميعادها", unit: "%", params: ["hours", "per"], describe: (p) => `% من الليدز اللي دخلت الـ Draft أو الـ Draft Admin (${perName(p)}) واتاخد عليها قرار (تفضل أو تتبعت لحد) خلال ${p.hours || 24} ساعة · اللي لسه مستني وعدّى الوقت بيتحسب متأخر` },
  call30: { group: "الليدز", label: "أول أكشن خلال 30 دقيقة (كل الليدز)", unit: "%", describe: () => "% من كل الليدز اللي اتعمل عليها أول أكشن خلال 30 دقيقة" },
  qualifiedN: { group: "الليدز", label: "عدد الـ Qualified (كل الليدز)", unit: "#", describe: () => "عدد كل الليدز اللي بقت Qualified" },
  outbound: { group: "الليدز", label: "شركات Outbound", unit: "#", describe: () => "عدد الشركات اللي اتكلمت Outbound آخر 7 أيام" },
  att: { group: "الحضور", label: "الحضور", unit: "%", describe: () => "% أيام الحضور من غير خصم (من البصمة)" },
  attSales: { group: "الحضور", label: "الحضور (السيلز)", unit: "%", describe: () => "نص الوزن للغياب (لحد 5 أيام في الربع) ونص للتأخير (لحد 6 ساعات في الشهر)، واللي يزيد بيقل بالنسبة" },
  team: { group: "الإدارة", label: "متوسط كروت فريقه", unit: "%", describe: () => "متوسط نتايج كروت الـ KPIs بتاعة الناس اللي بيتابعهم" },
  dealExec: { group: "الصفقات", label: "تنفيذ الصفقات في ميعادها", unit: "%", describe: () => "قيمة الصفقات اللي اتنفّذت في ميعادها ÷ قيمة الصفقات اللي ميعادها جه" },
  paperErrors: { group: "الصفقات", label: "أخطاء الورق", unit: "#", describe: () => "عدد الصفقات اللي المالية لقت في ورقها أخطاء" },
  verified: { group: "الانفنتوري", label: "الوحدات المتحدّثة", unit: "%", describe: () => "% من الوحدات المتاحة اللي متحدّثة (مش قديمة)" },
  resaleFresh: { group: "الانفنتوري", label: "وحدات الـ Resale المتحدّثة", unit: "%", describe: () => "% من وحدات الـ Resale المتاحة اللي متحدّثة" },
  in24: { group: "الانفنتوري", label: "إدخال الوحدات خلال 24 ساعة", unit: "%", params: ["type"], describe: (p) => `% من الوحدات${p.type ? ` ${p.type}` : ""} اللي اتدخلت خلال 24 ساعة من استلامها` },
  drive24: { group: "الانفنتوري", label: "رفع الصور خلال 24 ساعة", unit: "%", describe: () => "% من الوحدات اللي صورها اترفعت خلال 24 ساعة من دخولها" },
  lists24: { group: "الانفنتوري", label: "الرد على الـ Lists خلال 24 ساعة", unit: "%", describe: () => "% من طلبات الـ List اللي اتردّ عليها خلال 24 ساعة" },
  listsClean: { group: "الانفنتوري", label: "Lists من غير وحدات مش مؤكدة", unit: "%", describe: () => "% من الـ Lists اللي مافيهاش وحدات مش مؤكدة" },
  big500: { group: "الصفقات", label: "إقفال الليدز المؤهلة فوق 500 متر", unit: "%", params: ["per"], describe: (p) => `عدد الصفقات اللي مساحتها 500 متر أو أكتر ÷ عدد الليدز المؤهلة اللي طالبة 500 متر أو أكتر · ${perName(p)}` },
  webAds: { group: "التسويق", label: "إعلانات الموقع", unit: "#", describe: () => "متوسط إعلانات الموقع في اليوم آخر 7 أيام" },
  tickets: { group: "التذاكر", label: "التذاكر في ميعادها", unit: "%", describe: () => "% من التذاكر اللي اتقفلت في ميعادها" },
  disputes: { group: "التذاكر", label: "الشكاوى في ميعادها", unit: "%", describe: () => "% من الشكاوى اللي اتحلّت في ميعادها" },
  proc48: { group: "المشتريات", label: "الدفع خلال 48 ساعة", unit: "%", describe: () => "% من طلبات الشراء اللي اتدفعت خلال 48 ساعة" },
  pettyCap: { group: "المشتريات", label: "العهدة تحت الحد", unit: "%", describe: () => "رصيد العهدة تحت الحد = 100%، فوقه = 0%" },
  receipts: { group: "المشتريات", label: "الفواتير", unit: "%", describe: () => "% من المشتريات فوق 10,000 اللي ليها فاتورة متعلّقة" },
};

/** Why a metric with its settings can't be saved, or null: an unknown metric, or a setting the metric doesn't take. */
export function metricProblem(metric: string | null, params: MetricParams): string | null {
  if (!metric) return Object.keys(params).length ? "الإعدادات من غير مقياس" : null;
  const m = METRICS[metric];
  if (!m) return "المقياس ده مش في الكتالوج";
  const bad = Object.keys(params).find((k) => !(m.params ?? []).includes(k as MetricParam));
  return bad ? `«${m.label}» مالوش إعداد ${bad}` : null;
}

/**
 * The «بيتحسب: …» line under every item (11.11), in the card and the editor. `nameOf` turns an `enteredBy` entry (a user
 * id or a role key) into a name; a system item without a metric yet says so.
 */
export function calcText(
  it: { method: Method; metric: string | null; params: MetricParams; report: string | null; required: number | null; enteredBy: readonly string[]; source: string },
  nameOf: (x: string) => string,
): string {
  if (it.method === "system") return it.metric && METRICS[it.metric] ? METRICS[it.metric]!.describe(it.params) : "لسه ماتحددش بيتحسب من إيه";
  if (it.method === "report") return `${it.report ? `تسليم «${it.report}» في ميعاده` : "بيسلّمه بنفسه من الكارت"} · مطلوب ${it.required ?? 0} مرة في الربع`;
  const by = (it.enteredBy.length ? it.enteredBy : ["follower"]).map((x) => (x === "follower" ? "المتابع" : nameOf(x)));
  return `بيدخّله ${by.join(" أو ")} بإيده${it.source ? ` · من ${it.source}` : ""}`;
}

// ───────── 11.5 · the daily job's arithmetic (demo kpis.js `since`, `pct`, `scRows`) ─────────

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Where an item's period starts: the last 7 days, this Cairo month, or the quarter's first day («2026-Q4» → 1 Oct). */
export function kpiPeriodStart(per: unknown, now: Date, quarter: string, cal: WorkCalendar = PLACES_CALENDAR): Date {
  if (per === "week") return new Date(now.getTime() - WEEK_MS);
  if (per === "month") return dayStart(`${localDate(now, cal).slice(0, 7)}-01`, cal);
  const [y, n] = quarter.split("-Q").map(Number) as [number, number];
  return dayStart(`${y}-${String((n - 1) * 3 + 1).padStart(2, "0")}-01`, cal);
}

/** «متوسط في الأسبوع»: a count over the weeks since `from` (at least one), to one decimal. */
export const perWeek = (count: number, from: Date, now: Date): number => Math.round((count / Math.max(1, (now.getTime() - from.getTime()) / WEEK_MS)) * 10) / 10;

/** ok ÷ total in percent, to one decimal; `empty` when there is nothing to measure. */
export const pct = (ok: number, total: number, empty: number | null = null): number | null => (total > 0 ? Math.round((ok / total) * 1000) / 10 : empty);

export type Timeliness = "ok" | "late" | "waiting";
/** Done by the deadline = ok; done after it, or not done past it = late; not done and still in time = waiting. */
export const timeliness = (doneAt: Date | null, deadline: Date, now: Date): Timeliness =>
  doneAt ? (doneAt <= deadline ? "ok" : "late") : now > deadline ? "late" : "waiting";

/** The share done in time, leaving out the ones still waiting (11.15: «لسه مستني مابيتحسبش»). */
export function onTimeShare(states: readonly Timeliness[], empty: number | null = 100): number | null {
  const counted = states.filter((s) => s !== "waiting");
  return pct(counted.filter((s) => s === "ok").length, counted.length, empty);
}

/** 11.15 · a Second Call is due before the lead's Cairo day ends. */
export function endOfLocalDay(at: Date, cal: WorkCalendar = PLACES_CALENDAR): Date {
  const next = new Date(Date.parse(`${localDate(at, cal)}T00:00:00Z`) + 24 * 60 * 60_000).toISOString().slice(0, 10);
  return dayStart(next, cal);
}

/**
 * «الحضور (السيلز)»: half the weight for absence (up to 5 days in the quarter), half for lateness (up to 6 hours this
 * month); past the limit each half shrinks in proportion. In percent.
 */
export function salesAttendance(absentDays: number, lateHours: number): number {
  const half = (n: number, limit: number) => (n <= limit ? 50 : (50 * limit) / n);
  return Math.round((half(absentDays, 5) + half(lateHours, 6)) * 10) / 10;
}

// ───────── 11.13 · Farming / Approach ─────────

export const ACTIVITY_KINDS = ["Farming", "Approach"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
