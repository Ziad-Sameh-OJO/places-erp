/**
 * M-05 · leaves (7.5; M-05 3.1–3.2, 0.9): request → Team Leader → HR, balances per type from the settings
 * (`leaveTypes`), a reminder after 24 hours and an escalation after 48; sick and emergency leave are recorded after the
 * return, with a document.
 */
export const leaveDays = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Sick and emergency leave are recorded after coming back, with a document (0.9). */
export const afterReturn = (type: string): boolean => /مرض|طوارئ|عارض/.test(type);

/** «شغل من بره / عذر غياب» (M-05, 7.3): the Head approves, then HR confirms; no balance, asked before or after the day. */
export const OUTSIDE_REQUESTS = ["شغل من بره", "عذر غياب"] as const;
export const isOutsideRequest = (type: string): boolean => (OUTSIDE_REQUESTS as readonly string[]).includes(type);

export interface LeaveAsk { type: string; from: string; to: string; today: string; left: number; hasDocument: boolean }
/** Why the request can't be sent, or null. */
export function leaveProblem(a: LeaveAsk): string | null {
  if (a.from > a.to) return "«من» لازم تبقى قبل «لحد»";
  if (isOutsideRequest(a.type)) return null;
  if (afterReturn(a.type)) {
    if (!a.hasDocument) return `الإجازة ${a.type} بتتسجّل بمستند`;
  } else if (a.from < a.today) return "الطلب بيتعمل قبل الإجازة";
  const n = leaveDays(a.from, a.to);
  if (n > a.left) return `الرصيد ${a.left} يوم بس`;
  return null;
}

/** A request still at the Team Leader: remind after 24 hours, escalate after 48. */
export function leaveChase(sentAt: Date, now: Date, done: { reminded: boolean; escalated: boolean }): "remind" | "escalate" | null {
  const h = (now.getTime() - sentAt.getTime()) / 3_600_000;
  if (h >= 48 && !done.escalated) return "escalate";
  if (h >= 24 && !done.reminded) return "remind";
  return null;
}

/** Days of [from, to] that fall inside [monthStart, monthEnd] (the monthly balance report). */
export function daysWithin(from: string, to: string, start: string, end: string): number {
  const a = from > start ? from : start, b = to < end ? to : end;
  return a > b ? 0 : leaveDays(a, b);
}
