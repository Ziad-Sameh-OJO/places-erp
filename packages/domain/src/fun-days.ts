/**
 * M-05 · «الترفيه والاحتفالات» (HR, 15 Nov): HR plans the year's fun days; everyone they're for sees them and is told
 * when one is published, the day before and on its morning.
 */
import { dayStart, localDate } from "./business-time.ts";

/**
 * The hour (Cairo) the day-before and the morning reminders go out. Not given by the client: before work starts
 * (11:00), so people know before they leave home.
 */
export const FUN_DAY_REMINDER_HOUR = 9;
/** The home card «جاي قريب»: the next few. */
export const FUN_DAYS_ON_HOME = 3;

export type FunDayReminder = "dayBefore" | "morning";

/** No department chosen = everyone. */
export const funDayIsFor = (departments: readonly string[], department: string | null): boolean =>
  departments.length === 0 || (!!department && departments.includes(department));

export interface FunDayState {
  /** the Cairo day, "YYYY-MM-DD" */
  readonly date: string;
  readonly cancelled: boolean;
  /** when everyone was last told of it (published, or its date changed) */
  readonly notifiedAt: Date;
  readonly dayBeforeSentAt: Date | null;
  readonly morningSentAt: Date | null;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The reminders due now: each on its own Cairo day from FUN_DAY_REMINDER_HOUR, once. A reminder whose day has passed
 * is dropped (a stale «بكره» is wrong), and so is one whose day started after people were already told (published or
 * re-dated that same day: the publish notice already said it).
 */
export function dueFunDayReminders(e: FunDayState, now: Date): FunDayReminder[] {
  if (e.cancelled) return [];
  const today = localDate(now);
  const due = (day: string, sent: Date | null) =>
    !sent && today === day && now.getTime() >= dayStart(day).getTime() + FUN_DAY_REMINDER_HOUR * 3_600_000 && e.notifiedAt < dayStart(day);
  const out: FunDayReminder[] = [];
  if (due(addDays(e.date, -1), e.dayBeforeSentAt)) out.push("dayBefore");
  if (due(e.date, e.morningSentAt)) out.push("morning");
  return out;
}

const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("ar-EG-u-nu-latn", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

/** The notice: «يوم <التاريخ>: <العنوان>», then the time and place when given; a reminder starts «بكره» / «النهارده». */
export function funDayText(e: { title: string; date: string; time?: string | null; place?: string | null }, reminder?: FunDayReminder): string {
  const lead = reminder === "dayBefore" ? "بكره · " : reminder === "morning" ? "النهارده · " : "";
  const more = [e.time && `الساعة ${e.time}`, e.place && `في ${e.place}`].filter(Boolean).join(" · ");
  return `${lead}يوم ${dayName(e.date)}: ${e.title}${more ? ` · ${more}` : ""}`;
}

/**
 * The year's occasions HR can start from in one click. A fixed day carries its month-day; an Eid or Sham el-Nessim
 * follows the official holiday of that name in the system (the working day before it starts: the office is closed on
 * the holiday itself); none found = HR sets the date.
 */
export interface FunDayStarter { readonly key: string; readonly title: string; readonly monthDay?: string; readonly holiday?: string }
export const FUN_DAY_STARTERS: readonly FunDayStarter[] = [
  { key: "newYear", title: "احتفال رأس السنة", monthDay: "01-01" },
  { key: "ramadan", title: "إفطار رمضان" }, // a day inside Ramadan: HR picks it
  { key: "eidFitr", title: "احتفال عيد الفطر", holiday: "الفطر" },
  { key: "shamNessim", title: "شم النسيم", holiday: "شم النسيم" },
  { key: "mothersDay", title: "عيد الأم", monthDay: "03-21" },
  { key: "eidAdha", title: "احتفال عيد الأضحى", holiday: "الأضحى" },
];

/** The suggested date of a starter in `year`, or null when HR has to pick it. */
export function starterDate(s: FunDayStarter, year: number, holidays: readonly { from: string; label: string }[]): string | null {
  if (s.monthDay) return `${year}-${s.monthDay}`;
  const name = s.holiday;
  const h = name && holidays.find((x) => x.from.startsWith(`${year}-`) && x.label.includes(name));
  if (!h) return null;
  let d = addDays(h.from, -1);
  if (new Date(`${d}T00:00:00Z`).getUTCDay() === 5) d = addDays(d, -1); // Friday off: the Thursday before
  return d;
}
