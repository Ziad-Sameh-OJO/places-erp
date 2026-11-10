/**
 * 11.16 · «مهامي النهارده» from the KPIs (demo kpis.js kpiInbox, while the quarter is open):
 * - a card I follow that isn't approved yet: «KPIs <name>: N%» · «M بند يدوي بتدخّله · ومستني اعتمادك»
 * - a card I don't follow but type manual numbers on: «دخّل أرقام KPIs <name>» · «M بند بتدخّله بإيدك»
 * - my own hand-ins still owed («سلّمت» items with no report behind them): «تسليم: <item>» · «d من n»
 */
import { canEnterManual, type Method } from "./kpi.ts";

export interface TodayCard {
  id: string; employeeId: string; followerId: string | null; approved: boolean;
  items: { title: string; method: Method; enteredBy: readonly string[]; report: string | null; required: number | null; delivered: number }[];
}
export interface TodayWho { userId: string; employeeId: string | null; roles: readonly string[] }
export type KpiTodayLine =
  | { kind: "approve"; cardId: string; manual: number }
  | { kind: "enter"; cardId: string; manual: number }
  | { kind: "deliver"; cardId: string; item: string; delivered: number; required: number };

/** The follower; «الملاك» (no follower) = a Super Admin who isn't the card's owner (as the card screen decides). */
export const followsCard = (c: Pick<TodayCard, "followerId" | "employeeId">, w: TodayWho): boolean =>
  c.followerId ? c.followerId === w.employeeId : w.roles.includes("admin") && c.employeeId !== w.employeeId;

export function kpiTodayLines(cards: readonly TodayCard[], w: TodayWho): KpiTodayLine[] {
  const out: KpiTodayLine[] = [];
  for (const c of cards) {
    const follower = followsCard(c, w);
    const manual = c.items.filter((it) => it.method === "manual");
    if (follower && !c.approved) out.push({ kind: "approve", cardId: c.id, manual: manual.length });
    if (!follower) {
      const mine = manual.filter((it) => canEnterManual(it.enteredBy, { userId: w.userId, roles: w.roles, isFollower: false })).length;
      if (mine) out.push({ kind: "enter", cardId: c.id, manual: mine });
    }
    if (c.employeeId === w.employeeId) {
      for (const it of c.items) {
        if (it.method === "report" && !it.report && it.delivered < (it.required ?? 0)) out.push({ kind: "deliver", cardId: c.id, item: it.title, delivered: it.delivered, required: it.required ?? 0 });
      }
    }
  }
  return out;
}
