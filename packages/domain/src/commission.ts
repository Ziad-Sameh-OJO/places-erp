/**
 * M-02 · how the money from a deal is shared (client voice notes 3–6, done-deals sheet).
 * - What counts is what was actually collected (owner side + client side), from the first collection on (Q10, Q38).
 * - It is split half to the Buyer side and half to the Seller side; each half equally among that side's salespeople.
 * - A salesperson's share goes into their target; their scheme % of the share is their commission.
 * - The Seller (the unit's agent) only counts once Manar has approved them.
 * - A «note» override (targetBase) changes the target figure only, never the commission.
 */
import { type Piasters, allocate, formatEGP, percentOf } from "./money.ts";
import type { EntryLine } from "./ledger.ts";

export type DealSide = "buyer" | "seller";
export type DealStatus = "Pending Review" | "Approved" | "Partially Collected" | "Fully Collected" | "Rejected" | "Cancelled";

export interface DealMoney {
  readonly status: DealStatus;
  /** Places' commission due from the owner and from the client */
  readonly commissionOwner: Piasters;
  readonly commissionClient: Piasters;
  readonly payments: ReadonlyArray<{ readonly side: "owner" | "client"; readonly amount: Piasters }>;
  readonly buyers: readonly string[];
  readonly sellers: readonly string[];
  readonly sellerApproved: boolean;
  /** «note»: count a different amount in the targets (null = use what was collected) */
  readonly targetBase: Piasters | null;
  /** recorded only at closing (Q13): counts as a Done Deal but not in anyone's target */
  readonly offTarget: boolean;
}

export interface SalesShare {
  readonly salesId: string;
  readonly side: DealSide;
  /** share of the collected money (basis of the commission) */
  readonly share: Piasters;
  /** what goes into the salesperson's target */
  readonly targetShare: Piasters;
  readonly schemePercent: number;
  readonly commission: Piasters;
}

const OFF_BOOKS: ReadonlySet<DealStatus> = new Set(["Pending Review", "Rejected", "Cancelled"]);

export const placesCommission = (d: DealMoney): Piasters => d.commissionOwner + d.commissionClient;
export const collected = (d: DealMoney): Piasters => d.payments.reduce((s, p) => s + p.amount, 0);
export const remaining = (d: DealMoney): Piasters => Math.max(0, placesCommission(d) - collected(d));

/** Revenue, targets and Transactions start at the first collection; a cancelled deal drops out everywhere (Q12). */
export const countsAsRevenue = (d: DealMoney): boolean => !OFF_BOOKS.has(d.status) && collected(d) > 0;
export const countsInTarget = (d: DealMoney): boolean => countsAsRevenue(d) && !d.offTarget;

export function collectionStatus(d: DealMoney): DealStatus {
  if (OFF_BOOKS.has(d.status)) return d.status;
  const c = collected(d);
  return c >= placesCommission(d) ? "Fully Collected" : c > 0 ? "Partially Collected" : "Approved";
}

/** 5.3: why a collection can't be recorded, or null — only on an approved deal not fully collected, never above what's left. */
export function collectionProblem(d: DealMoney, amount: Piasters): string | null {
  if (d.status !== "Approved" && d.status !== "Partially Collected") return "التحصيل بيتسجّل على صفقة اتوافق عليها ولسه متحصّلتش بالكامل";
  if (!(amount > 0)) return "المبلغ لازم يبقى أكبر من صفر";
  if (amount > remaining(d)) return `المبلغ أكبر من الباقي (${formatEGP(remaining(d))})`;
  return null;
}

/**
 * 5.15 · M-07 «تعديل يدوي لحد عنده صلاحية» (demo deals.js payEdit): why a recorded collection (and its TCR) can't take
 * `amount` instead of `old`, or null. A reason is required, the deal's total never goes above its commission, and a
 * fully collected deal can't drop back: its salespeople's commission is already due (open question in the PR).
 */
export function collectionEditProblem(d: DealMoney, old: Piasters, amount: Piasters, reason: string): string | null {
  if (d.status !== "Partially Collected" && d.status !== "Fully Collected") return "التعديل بيبقى على تحصيل صفقة شغالة";
  if (!reason.trim()) return "اكتب السبب";
  if (!(amount > 0)) return "المبلغ لازم يبقى أكبر من صفر";
  if (amount === old) return "ده نفس المبلغ";
  const total = collected(d) - old + amount;
  if (total > placesCommission(d)) return `المبلغ أكبر من الباقي (${formatEGP(placesCommission(d) - collected(d) + old)})`;
  if (d.status === "Fully Collected" && total < placesCommission(d)) return "الصفقة اتحصّلت بالكامل وعمولات السيلز اتثبتت عليها · مينفعش تقلّ";
  return null;
}

/**
 * M-02 «محسوم في ميتنج 4 نوفمبر»: once the Office Manager approves, the accountant gets «حصّل عمولة» (demo finance.js
 * financeInbox) and keeps it while the deal still takes a collection (the same rule as `collectionProblem`).
 */
export const awaitsCollection = (d: DealMoney): boolean => (d.status === "Approved" || d.status === "Partially Collected") && remaining(d) > 0;

/** Q37–Q39: Places' whole commission is revenue from the first collection on (the rest is owed by the client, 113). */
export const revenueOnCollection = (d: DealMoney): Piasters => (collected(d) === 0 ? placesCommission(d) : 0);

export const buyersOf = (d: DealMoney): readonly string[] => d.buyers;
export const sellersOf = (d: DealMoney): readonly string[] => (d.sellerApproved ? d.sellers : []);

/**
 * Example from the client: 100,000 collected, two buyers and one seller →
 * each buyer 25,000, the seller 50,000; at a 30% scheme the seller earns 15,000.
 */
export function splitDeal(d: DealMoney, schemeOf: (salesId: string) => number): SalesShare[] {
  const base = collected(d);
  const targetBase = d.targetBase ?? base;
  const [buyerHalf, sellerHalf] = allocate(base, 2) as [Piasters, Piasters];
  const [buyerTarget, sellerTarget] = allocate(targetBase, 2) as [Piasters, Piasters];
  const out: SalesShare[] = [];
  const sides: Array<[DealSide, readonly string[], Piasters, Piasters]> = [
    ["buyer", buyersOf(d), buyerHalf, buyerTarget],
    ["seller", sellersOf(d), sellerHalf, sellerTarget],
  ];
  for (const [side, ids, half, targetHalf] of sides) {
    if (ids.length === 0) continue;
    const shares = allocate(half, ids.length);
    const targets = allocate(targetHalf, ids.length);
    ids.forEach((salesId, i) => {
      const scheme = schemeOf(salesId);
      out.push({ salesId, side, share: shares[i]!, targetShare: targets[i]!, schemePercent: scheme, commission: percentOf(shares[i]!, scheme) });
    });
  }
  return out;
}

/** One Transaction for every salesperson named on a deal that counts (two buyers = one each). */
export function transactionsOf(salesId: string, deals: readonly DealMoney[]): number {
  return deals.filter((d) => countsAsRevenue(d) && (buyersOf(d).includes(salesId) || sellersOf(d).includes(salesId))).length;
}

export function targetAchieved(salesId: string, deals: readonly DealMoney[], schemeOf: (id: string) => number): Piasters {
  return deals.filter(countsInTarget).reduce((sum, d) => sum + splitDeal(d, schemeOf).filter((s) => s.salesId === salesId).reduce((a, s) => a + s.targetShare, 0), 0);
}

/** 9.15 (4 Nov): a salesperson's commission on one deal is payable once it's fully collected, minus what was paid on it. */
export function payoutDue(d: DealMoney, salesId: string, schemeOf: (id: string) => number, paid: Piasters): Piasters {
  if (d.status !== "Fully Collected") return 0;
  const earned = splitDeal(d, schemeOf).filter((s) => s.salesId === salesId).reduce((a, s) => a + s.commission, 0);
  return Math.max(0, earned - paid);
}

/** The deal's line in «كشف عمولة» (demo finance.js): due · paid · waiting for the rest · not collected yet. */
export function payoutState(d: DealMoney, due: Piasters): string {
  if (d.status === "Fully Collected") return due > 0 ? "مستحقة · اتحصّلت بالكامل" : "اتصرفت";
  return collected(d) > 0 ? `مستنية باقي التحصيل ${formatEGP(remaining(d))}` : "لسه مااتحصّلتش";
}

/**
 * Why a «صرف عمولة سيلز» can't go out, or null: never above what's due on the deal (or the TL's own figure), and never
 * above their 21103 balance — a cancelled deal already paid out leaves it lower, so the next payout takes it back (Q12).
 */
export function payoutProblem(due: Piasters, balance: Piasters, amount: Piasters): string | null {
  if (!(amount > 0)) return "المبلغ لازم يبقى أكبر من صفر";
  if (due <= 0) return "مفيش عمولة مستحقة هنا";
  if (amount > due) return `المستحق ${formatEGP(due)} بس`;
  if (amount > balance) return `رصيد حسابه في العمولات المستحقة ${formatEGP(Math.max(0, balance))} بس`;
  return null;
}

/**
 * 9.6 (4 Nov tree: 5303 «عمولة اوبريشن» · 5304 «عمولات خارجية»): booked with the revenue at the first collection.
 * Operations = opsPct% of Places' commission; external = the amount the Office Manager wrote on the review, else
 * externalPct%. The rates are the Super Admin's settings, the demo's 5% and 0 until the client confirms (needs-client).
 */
export interface DirectCostRates { readonly opsPct: number; readonly externalPct: number }
export function directCosts(commission: Piasters, rates: DirectCostRates, external: Piasters | null): { ops: Piasters; external: Piasters } {
  return { ops: percentOf(commission, rates.opsPct), external: external ?? percentOf(commission, rates.externalPct) };
}

/** Dr each expense / Cr what's owed on it; null when both are zero. */
export function directCostLines(c: { ops: Piasters; external: Piasters }, a: { opsExpense: string; opsDue: string; extExpense: string; extDue: string }): EntryLine[] | null {
  const lines: EntryLine[] = [];
  if (c.ops > 0) lines.push({ accountId: a.opsExpense, debit: c.ops, credit: 0 }, { accountId: a.opsDue, debit: 0, credit: c.ops });
  if (c.external > 0) lines.push({ accountId: a.extExpense, debit: c.external, credit: 0 }, { accountId: a.extDue, debit: 0, credit: c.external });
  return lines.length ? lines : null;
}

/**
 * Q40 (9.10): in the Cost Center a campaign's spend is spread over the Qualified leads it brought; a deal carries one
 * lead's share. With no Qualified lead yet the deal carries all of it (the demo's «|| 1»). The books keep the total.
 */
export const campaignShare = (spent: Piasters, qualified: number): Piasters => (qualified > 0 ? Math.round(spent / qualified) : spent);
