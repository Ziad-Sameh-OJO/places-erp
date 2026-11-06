/**
 * M-02 · registering a Done Deal and the Office Manager's review (2.1 steps 1 · 5 · 6 · 9, Q9).
 * The money split itself is in commission.ts.
 */
import type { Piasters } from "./money.ts";
import type { DealStatus } from "./commission.ts";

/** M-02 3.1 «type». */
export const DEAL_TYPES = ["Rent", "Resale", "Primary", "Income"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_STATUSES: readonly DealStatus[] = ["Pending Review", "Approved", "Partially Collected", "Fully Collected", "Rejected", "Cancelled"];

/** D-301… the demo's numbering, from a database sequence. */
export const dealCode = (n: number | bigint): string => `D-${n}`;

/**
 * Who is on the deal (2.1 step 5 · 9): the salesperson who closed it plus whoever they say was with them on the
 * Buyer side («حد معاك في الديل Buyer؟»). The Seller is the unit's agent — waiting for Manar's approval — unless the
 * agent is already a Buyer, then the deal has no Seller (demo).
 */
export function dealSides(closer: string, withMe: readonly string[], unitAgent: string | null): { buyers: string[]; sellers: string[] } {
  const buyers = [...new Set([closer, ...withMe])];
  const sellers = unitAgent && !buyers.includes(unitAgent) ? [unitAgent] : [];
  return { buyers, sellers };
}

/** A deal must expect some commission, from the Owner or the Client (demo: «اكتب العمولة المتوقعة من الـ Owner أو الـ Client»). */
export const expectsCommission = (owner: Piasters, client: Piasters): boolean => owner >= 0 && client >= 0 && owner + client > 0;

export type ReviewDecision = "approve" | "reject";

/**
 * Q9: the Done Deal reaches the Office Manager first; she reviews it once. A rejection goes back to the salesperson
 * with the reason written. Returns what's wrong, or null when the review may go ahead.
 */
export function reviewProblem(status: DealStatus, decision: ReviewDecision, reason: string | undefined): string | null {
  if (status !== "Pending Review") return "الصفقة دي اتراجعت قبل كده";
  if (decision === "reject" && !reason?.trim()) return "اكتبي سبب الرفض";
  return null;
}

const HOUR_MS = 3_600_000;

/**
 * Q13 (M-02 2.3): a deal recorded only at closing — the request was created and the deal closed within `alarmH`
 * hours (24 by default, «قواعد الليدز ← الإقفال», 1.29) — raises an Alarm and stays out of the salespeople's target;
 * it is still a Done Deal (commission.ts countsInTarget).
 */
export const closedTooSoon = (requestCreatedAt: Date, closedAt: Date, alarmH: number): boolean =>
  closedAt.getTime() - requestCreatedAt.getTime() <= alarmH * HOUR_MS;

/** The note (Office Manager / Finance, 3.1) is written on a deal that is on the sheet: approved or being collected. */
export const takesNote = (status: DealStatus): boolean => status === "Approved" || status === "Partially Collected" || status === "Fully Collected";

/**
 * M-02 3.1 «ميعاد تنفيذ الصفقة» (Office Manager) · KPI 2202 «≥90% من قيمة الصفقات اتنفذت في ميعادها»: the chip the
 * demo shows on the deal (deals.js execPapers). Days are Cairo calendar days, YYYY-MM-DD. Executed with no due date
 * counts as on time, like the demo.
 */
export type ExecState = "on-time" | "late" | "overdue";
export function execState(due: string | null, executed: string | null, today: string): ExecState | null {
  if (executed) return !due || executed <= due ? "on-time" : "late";
  return due && due < today ? "overdue" : null;
}

/** «اتنفذت» is recorded once, on a deal on the sheet. */
export function executeProblem(status: DealStatus, executed: boolean): string | null {
  if (!takesNote(status)) return "التنفيذ بيتسجّل على صفقة اتوافق عليها بس";
  return executed ? "اتسجّل التنفيذ قبل كده" : null;
}

/** M-02 3.1 «مراجعة أوراق الصفقة» (Finance): «سليم» or «فيه خطأ + كلام» — an error needs what's wrong (KPI: zero errors). */
export function papersProblem(status: DealStatus, ok: boolean, note: string | undefined): string | null {
  if (!takesNote(status)) return "مراجعة الأوراق بتبقى على صفقة اتوافق عليها بس";
  return !ok && !note?.trim() ? "اكتب الخطأ إيه" : null;
}

/** M-02 2.3 (12) · 9.6: a deal on the sheet (approved or being collected) is cancelled once, with the reason written. */
export function cancelProblem(status: DealStatus, reason: string): string | null {
  if (!takesNote(status)) return status === "Cancelled" ? "الصفقة دي اتلغت قبل كده" : "الإلغاء بيبقى على صفقة اتوافق عليها";
  if (!reason.trim()) return "اكتب سبب الإلغاء";
  return null;
}

/** Only what really changed, old next to new (5.2: every amount change is audited with both values). */
export function changes(before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const keys = Object.keys(after).filter((k) => after[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!keys.length) return null;
  return { before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: Object.fromEntries(keys.map((k) => [k, after[k]])) };
}

/** T181… one sequence for the whole company (M-02 3.2: «كود تسلسلي، مثال T180»). */
export const tcrCode = (n: number | bigint): string => `T${n}`;

/**
 * M-02 2.3 · 3.2: every salesperson on the deal signs each TCR, once (a later collection makes a new TCR they sign
 * again). Returns what's wrong, or null when `me` may sign.
 */
export function signProblem(signatures: ReadonlyArray<{ employeeId: string; signedAt: Date | null }>, me: string | null): string | null {
  const s = signatures.find((x) => x.employeeId === me);
  if (!s) return "الـ TCR دي مش عليك";
  if (s.signedAt) return "مضيت عليها قبل كده";
  return null;
}
