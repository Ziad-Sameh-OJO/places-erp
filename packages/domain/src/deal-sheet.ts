/**
 * M-02 5.3 · 6.1 · «لوحة الإيرادات» (5.10): the expected commission, what was collected, what's left and the salespeople's
 * commissions — over the deals that count, i.e. from their first collection on, never a cancelled one (Q12, Q38).
 */
import { type DealMoney, collected, countsAsRevenue, placesCommission, splitDeal } from "./commission.ts";
import type { Piasters } from "./money.ts";

export interface RevenueBoard { expected: Piasters; collected: Piasters; remaining: Piasters; commission: Piasters; deals: number }

export function revenueBoard(deals: readonly DealMoney[], schemeOf: (salesId: string) => number): RevenueBoard {
  const rev = deals.filter(countsAsRevenue);
  const expected = rev.reduce((s, d) => s + placesCommission(d), 0);
  const got = rev.reduce((s, d) => s + collected(d), 0);
  const commission = rev.reduce((s, d) => s + splitDeal(d, schemeOf).reduce((a, x) => a + x.commission, 0), 0);
  return { expected, collected: got, remaining: expected - got, commission, deals: rev.length };
}

/** The sheet's «owner side» / «client side» columns. */
export const collectedFrom = (d: DealMoney, side: "owner" | "client"): Piasters => d.payments.filter((p) => p.side === side).reduce((s, p) => s + p.amount, 0);
