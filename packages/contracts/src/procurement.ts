import { z } from "zod";
import { CalendarDay, Id, Money, Page } from "./common.ts";

/** M-08 · purchase requests (10.1 · 10.2 · 10.3). Wording from demo/design-2 procurement.js. */
export const PURCHASE_STATUS = ["Pending", "Approved", "Rejected", "Settled", "Posted"] as const;
export type PurchaseStatusKey = (typeof PURCHASE_STATUS)[number];

const Positive = Money.refine((m) => Number(m) > 0, "المبلغ لازم يبقى أكبر من صفر");
const Files = z.array(Id).max(10, "كفاية 10 مرفقات");

/** «طلب شراء / دفع»: الحاجة · المبلغ · البند (من شجرة الحسابات) · المورد · المرفقات. */
export const NewPurchase = z.object({
  item: z.string({ required_error: "اكتب الحاجة" }).trim().min(2, "اكتب الحاجة").max(160, "الحاجة · طويل"),
  amount: Positive,
  accountId: Id,
  vendor: z.string().trim().max(80, "المورد · طويل").optional(),
  attachments: Files.default([]),
});
export type NewPurchase = z.infer<typeof NewPurchase>;

/** «قرارك»: موافقة، أو رفض بالسبب. */
export const PurchaseDecision = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  reason: z.string().trim().max(300).optional(),
}).refine((d) => d.decision === "Approved" || !!d.reason, { path: ["reason"], message: "اكتب سبب الرفض" });
export type PurchaseDecision = z.infer<typeof PurchaseDecision>;

/** «التسوية»: اتدفع من (معلومة للمالية) · المبلغ وقت الدفع. A different amount sends it back for approval. */
export const SettlePurchase = z.object({ paidFromId: Id, amount: Positive, attachments: Files.default([]) });
export type SettlePurchase = z.infer<typeof SettlePurchase>;

/** Finance «اصرفها»: the safe / bank it really leaves from; the amount is the request's (locked). */
export const PostPurchase = z.object({ fromId: Id, date: CalendarDay.optional() });
export type PostPurchase = z.infer<typeof PostPurchase>;

export const PurchaseFilters = Page.extend({
  status: z.enum(PURCHASE_STATUS).optional(),
  accountId: Id.optional(),
  group: z.string().regex(/^5\d$/).optional(), // نوع المصروف: 52 إدارية · 53 بيعية
  vendor: z.string().trim().max(80).optional(),
  from: CalendarDay.optional(),
  to: CalendarDay.optional(),
});
export type PurchaseFilters = z.infer<typeof PurchaseFilters>;

/** «سقف العهدة»: set by finance on the cash account procurement pays from (M-08 3.1 / Q47). */
export const CustodyCap = z.object({ accountId: Id, cap: Money.refine((m) => Number(m) >= 0, "السقف مايبقاش بالسالب") });
export type CustodyCap = z.infer<typeof CustodyCap>;

export interface PurchaseView {
  id: string;
  no: string; // PR-12
  item: string;
  amount: string;
  account: { id: string; code: string; name: string };
  vendor: string | null;
  attachments: { id: string; name: string }[];
  status: PurchaseStatusKey;
  createdBy: { id: string; name: string };
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  paidFrom: { id: string; name: string } | null;
  settledAt: string | null;
  postedAt: string | null;
  move: { id: string; no: string } | null;
  /** what is left in the line's budget now (null: no budget on the line) and whether this request would cross it (Q45) */
  budgetLeft: string | null;
  overBudget: boolean;
  /** why the signed-in person can't approve it (null: they can, or it isn't pending) */
  blocker: string | null;
}
export interface PurchasesView { items: PurchaseView[]; total: number; page: number; pageSize: number }

export interface BudgetLineRow { accountId: string; code: string; name: string; group: string; budget: string | null; spent: string; left: string | null; pct: number; level: string }
export interface CustodyBox { accountId: string; code: string; name: string; balance: string; cap: string | null }
export interface ProcurementOverview {
  pending: number;
  approved: number;
  /** every expense leaf (the form's «البند»), with its budget when it has one */
  lines: BudgetLineRow[];
  groups: { code: string; name: string }[];
  totals: { budget: string; spent: string; left: string };
  /** the cash accounts (the settle form's «اتدفع من») with the custody ceilings finance set */
  cash: CustodyBox[];
  /** KPI M-12: requests settled within 48 hours of being sent */
  in48: { done: number; total: number };
}
