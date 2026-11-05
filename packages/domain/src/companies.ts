/**
 * M-01 · «شيت الشركات» (1.20): Telesales keeps the companies sheet, split into the categories of the settings list
 * (63, M-13). A company someone else writes on a lead and that isn't in the sheet goes to Telesales to add (M-01 2.1, 6.1).
 */

/** Who adds to the sheet: Telesales (M-01 2.1 «زرار أضيفها لشيت الشركات للـ Telesales بس»), and the admin. */
const SHEET_KEEPERS: ReadonlySet<string> = new Set(["telesales", "admin"]);
export const keepsCompaniesSheet = (roles: readonly string[]): boolean => roles.some((r) => SHEET_KEEPERS.has(r));

/** «شركة جديدة Outbound» (KPI M-12): 15 a week, the last 7 days (demo «Outbound الأسبوع ده: N من 15»). */
export const OUTBOUND_WEEKLY_TARGET = 15;
export const OUTBOUND_WINDOW_DAYS = 7;

/** 1.21 · «عقدهم بيخلص خلال 90 يوم» (demo): the report's window, an opportunity to call them before they renew. */
export const CONTRACT_ENDING_DAYS = 90;

/**
 * The days a contract-ending report covers (M-01 6.1, from «end contract date»): from today to today + `days`, both
 * included, as calendar days ("YYYY-MM-DD", Cairo). A contract that already ended isn't an opportunity any more.
 */
export function contractEndingWindow(today: string, days: number = CONTRACT_ENDING_DAYS): { from: string; to: string } {
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return { from: today, to };
}
