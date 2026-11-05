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
