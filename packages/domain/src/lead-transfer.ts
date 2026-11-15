/**
 * 14.7 · M-01 (management meeting, 15 Nov): moving a lead to another salesperson.
 * - The one it was taken from loses it (data scope follows the holder) and isn't told where it went.
 * - «الجديد يشوف الكومنتات القديمة؟» (default no): the earlier comments are hidden from whoever holds or manages it
 *   now; the Super Admin always sees the whole history.
 * - A Team Leader moves leads only inside his own team.
 */
import { SUPER_ADMIN_ROLE } from "./lists.ts";
import type { DataScope } from "./permissions.ts";

/** The comments cut-off after a transfer: kept as is when the new holder may see them, else from now on only. */
export const commentsFromAfterTransfer = (current: Date | null, showOld: boolean, now: Date): Date | null => (showOld ? current : now);

/** Whether this comment is shown to this viewer: before the cut-off only the Super Admin sees it. */
export function commentVisible(c: { readonly kind: string; readonly at: Date }, commentsFrom: Date | null, roles: readonly string[]): boolean {
  return c.kind !== "comment" || !commentsFrom || c.at >= commentsFrom || roles.includes(SUPER_ADMIN_ROLE);
}

/** Who moves a lead by hand: whoever approves leads (Operations, the Sales Director, the admin) and the Team Leader. */
export const transfersLeads = (roles: readonly string[], approvesLeads: boolean): boolean => approvesLeads || roles.includes("tl");

/** A Team Leader (team scope) or anyone narrower moves a lead only to someone of his own team (`teamIds`: him and his members). */
export const transferTargetAllowed = (scope: DataScope, teamIds: readonly string[], toId: string): boolean =>
  scope === "all" || scope === "dept" || teamIds.includes(toId);
