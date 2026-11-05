/**
 * M-11 · the contract of a Done Deal and its installment table (2.1, 3.2, 3.3). The client approved the module's flow
 * with demo design-2 (4 Nov meeting); its numbers (90-day window, value ÷ count) are RECA TECH's proposal in the
 * requirements. Days are calendar days "YYYY-MM-DD"; money is piasters.
 */
import { type Piasters, allocate, percentOf } from "./money.ts";

export const CONTRACT_STATUSES = ["Active", "Renewed", "Ended", "Terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
/** M-11 3.3 «قرّب يخلص»: 90 days or less left (2.4: the first renewal alert). */
export const RENEWAL_WINDOW_DAYS = 90;

export interface InstallmentLine { readonly dueOn: string; readonly amount: Piasters }

const DAY_MS = 86_400_000;
const toDay = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** The same day n months later; the 31st becomes the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(day: string, n: number): string {
  const d = utc(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return toDay(target);
}

export const daysBetween = (from: string, to: string): number => Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);

/**
 * M-11 3.2: installment = value ÷ number of installments, one every `everyMonths` months from the start. Split to the
 * piaster so the table always adds back up to the value (100,000 in 3 → 33,333.34 + 33,333.33 + 33,333.33).
 */
export function installmentPlan(value: Piasters, startsOn: string, count: number, everyMonths: number): InstallmentLine[] {
  return allocate(value, count).map((amount, k) => ({ dueOn: addMonths(startsOn, k * everyMonths), amount }));
}

/** What's wrong with a contract and its table (Arabic, shown as is), or null. A custom table must add up to the value. */
export function contractProblem(c: { value: Piasters; startsOn: string; endsOn: string; escalation: number; plan: readonly InstallmentLine[] }): string | null {
  if (c.value <= 0) return "قيمة العقد لازم تبقى أكبر من صفر";
  if (c.endsOn <= c.startsOn) return "نهاية العقد لازم تبقى بعد بدايته";
  if (c.escalation < 0 || c.escalation > 100) return "الزيادة السنوية بين 0 و 100%";
  if (!c.plan.length) return "جدول الأقساط فاضي";
  if (c.plan.some((x) => x.amount <= 0)) return "كل قسط لازم يبقى أكبر من صفر";
  if (c.plan.some((x) => x.dueOn < c.startsOn || x.dueOn > c.endsOn)) return "ميعاد القسط لازم يبقى جوه مدة العقد";
  if (c.plan.reduce((s, x) => s + x.amount, 0) !== c.value) return "مجموع الأقساط لازم يساوي قيمة العقد";
  return null;
}

/** M-11 3.2: next year's rent = this year's × (1 + the yearly increase). */
export const nextYearValue = (value: Piasters, escalationPercent: number): Piasters => value + percentOf(value, escalationPercent);

/** M-11 3.3: an active contract with 90 days or less left shows «قرّب يخلص». */
export const endingSoon = (status: ContractStatus, endsOn: string, today: string): boolean =>
  status === "Active" && daysBetween(today, endsOn) >= 0 && daysBetween(today, endsOn) <= RENEWAL_WINDOW_DAYS;

/** M-11 2.1 step 5 · 2.4: renewal alerts 90, 60 and 30 days before the end. */
export const RENEWAL_ALERT_DAYS = [90, 60, 30] as const;

/**
 * Which renewal alert is due today, if any: the nearest threshold the contract has reached and not been alerted for.
 * Thresholds passed while nobody looked (the worker was down, the contract was uploaded late) are marked too, so the
 * salesperson gets one alert, not three at once. The first alert of a contract also opens the renewal lead (7.1).
 */
export function renewalAlert(endsOn: string, today: string, alerted: readonly number[]): { days: number; mark: number[] } | null {
  const left = daysBetween(today, endsOn);
  if (left < 0) return null;
  const reached = RENEWAL_ALERT_DAYS.filter((d) => left <= d);
  if (!reached.length || reached.every((d) => alerted.includes(d))) return null;
  return { days: Math.min(...reached), mark: [...reached] };
}

export type InstallmentState ="paid" | "partial" | "late" | "due";
/**
 * M-11 6.1 «Aging 30 / 60 / 90»: what is still owed on installments past their day, by how late they are —
 * 0–30 · 31–60 · 61–90 · over 90 days (demo). Arrears = installments due − collected (3.2).
 */
export function agingBuckets(lines: ReadonlyArray<{ dueOn: string; amount: Piasters; paid: Piasters }>, today: string): [Piasters, Piasters, Piasters, Piasters] {
  const out: [Piasters, Piasters, Piasters, Piasters] = [0, 0, 0, 0];
  for (const l of lines) {
    const owed = l.amount - l.paid, late = daysBetween(l.dueOn, today);
    if (owed <= 0 || late <= 0) continue;
    out[late <= 30 ? 0 : late <= 60 ? 1 : late <= 90 ? 2 : 3] += owed;
  }
  return out;
}

/** The demo's chips: paid in full · part of it (M-11 2.3 «Partially Paid») · past its day and unpaid · not due yet. */
export function installmentState(i: { dueOn: string; amount: Piasters; paid: Piasters }, today: string): InstallmentState {
  if (i.paid >= i.amount) return "paid";
  if (i.paid > 0) return "partial";
  return i.dueOn < today ? "late" : "due";
}
