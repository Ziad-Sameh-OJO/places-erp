import { z } from "zod";
import { DEAL_STATUSES, DEAL_TYPES, type DealStatus, type DealType } from "@places/domain";
import { CalendarDay, Id, Money, Page } from "./common.ts";

/** «سجّل صفقة» (M-02 2.1 step 1 · 5): the company, source, location and Seller come from the lead and the unit. */
export const CreateDeal = z.object({
  leadId: Id,
  unitId: Id,
  space: z.number().int("المساحة رقم صحيح").positive("المساحة لازم تبقى أكبر من صفر"),
  type: z.enum(DEAL_TYPES),
  commissionOwner: Money,
  commissionClient: Money,
  /** «حد معاك في الديل Buyer؟» */
  withMe: z.array(Id).max(10).default([]),
});
export type CreateDeal = z.infer<typeof CreateDeal>;

/** The Office Manager's review (Q9): she may correct any field before approving; a rejection needs its reason. */
export const ReviewDeal = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000, "السبب طويل").optional(),
  space: z.number().int("المساحة رقم صحيح").positive("المساحة لازم تبقى أكبر من صفر").optional(),
  type: z.enum(DEAL_TYPES).optional(),
  location: z.string().trim().min(1, "اكتب المبنى / المشروع").max(160).optional(),
  commissionOwner: Money.optional(),
  commissionClient: Money.optional(),
  buyers: z.array(Id).min(1, "اختار سيلز الـ Buyer").max(10).optional(),
  /** 9.6: the external commission on this deal, if any (5304) */
  externalCommission: Money.refine((m) => !m.startsWith("-"), "المبلغ مايبقاش بالسالب").optional(),
});
export type ReviewDeal = z.infer<typeof ReviewDeal>;

/** «note» (M-02 3.1): the Office Manager or Finance; a different amount here changes the target only. */
export const DealNote = z.object({
  note: z.string().trim().max(1000, "الملاحظة طويلة"),
  targetBase: Money.refine((m) => !m.startsWith("-"), "المبلغ مايبقاش بالسالب").nullable(),
});
export type DealNote = z.infer<typeof DealNote>;

/**
 * «سجّل تحصيل» (5.3, 4 Nov): a receive voucher (9.11) into a safe / bank against the client's account (113…).
 * The first collection also books the whole commission as revenue, so it needs the revenue line (41…).
 */
export const CollectDeal = z.object({
  side: z.enum(["owner", "client"]),
  toId: Id,
  amount: Money,
  revenueId: Id.optional(),
  date: CalendarDay.optional(),
});
export type CollectDeal = z.infer<typeof CollectDeal>;
/** «الغي الصفقة» (M-02 2.3 (12) · 9.6): the reason is required; its revenue and commission entries are reversed. */
export const CancelDeal = z.object({ reason: z.string().trim().min(1, "اكتب سبب الإلغاء").max(1000, "السبب طويل") });
export type CancelDeal = z.infer<typeof CancelDeal>;
/** A recorded collection: the deal's new status, what's left, the voucher and entry numbers, and its TCR (5.12). */
export interface DealCollected { status: DealStatus; collected: string; remaining: string; move: string; entry: string; tcr: string }

/** 9.15 «صرف عمولة سيلز»: on one deal and its TCR; without a deal it is a Team Leader's commission (5.8). */
export const PayCommission = z.object({
  employeeId: Id,
  dealId: Id.optional(),
  tcrId: Id.optional(),
  fromId: Id,
  amount: Money,
  date: CalendarDay.optional(),
  memo: z.string().trim().max(500, "البيان طويل").optional(),
});
export type PayCommission = z.infer<typeof PayCommission>;
/** «كشف عمولة» (demo finance.js): each deal with his part, what's due and paid, its TCRs; the vouchers paid; amounts as decimal strings. */
export interface CommissionStatement {
  employee: { id: string; name: string };
  /** his 21103 balance (deals + TL commission − paid) */
  balance: string;
  /** the balance outside the deals' dues: a Team Leader's commission, paid without a deal */
  tlDue: string;
  deals: Array<{
    dealId: string; code: string; company: string; unitCode: string; placesCommission: string; status: DealStatus; state: string;
    shares: Array<{ side: "buyer" | "seller"; schemePercent: number; share: string }>; commission: string; paid: string; due: string;
    tcrs: Array<{ id: string; code: string; amount: string; side: "owner" | "client"; signed: boolean }>;
  }>;
  payouts: Array<{ id: string; moveId: string; move: string; date: string; deal: string | null; tcr: string | null; amount: string }>;
}
/** One line of «صرف عمولة سيلز»'s picker: a salesperson / TL with their 21103 account and its balance. */
export interface CommissionPerson { employeeId: string; name: string; code: string; balance: string }
export interface CommissionPaid { moveId: string; move: string; entry: string; due: string; signed: boolean | null }

/** 4.9: marketing attaches the client's logo (a finished upload, 0.9). */
export const DealLogo = z.object({ fileId: Id });
export type DealLogo = z.infer<typeof DealLogo>;
/** Q26: what marketing may see of a Done Deal — location, space, company, type and the Buyer, nothing else. */
export interface MarketingDeal { id: string; code: string; buyer: string; company: string; type: DealType; space: number; location: string; logo: { id: string; name: string } | null }

export const DealFilters = Page.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(DEAL_STATUSES as [DealStatus, ...DealStatus[]]).optional(),
});
export type DealFilters = z.infer<typeof DealFilters>;

export const DealUnitQuery = z.object({ q: z.string().trim().max(60).optional() });
export type DealUnitQuery = z.infer<typeof DealUnitQuery>;

export interface DealPerson { id: string; name: string }
export interface DealRow {
  id: string; code: string; company: string; unitCode: string; location: string; space: number; type: DealType;
  status: DealStatus; commissionOwner: string; commissionClient: string;
  buyers: DealPerson[]; sellers: Array<DealPerson & { approved: boolean }>;
  closedAt: string; offTarget: boolean; note: string | null; targetBase: string | null;
  /** M-02 3.2 «Date»: the month of the deal's first collection (YYYY-MM), and its TCR codes («tcr»). */
  month: string | null; tcrs: string[];
}
/** 5.12: the TCR made by one collection, with each salesperson on the deal and whether they signed. */
export interface DealTcr {
  id: string; code: string; date: string; side: "owner" | "client"; amount: string;
  signatures: Array<DealPerson & { side: "buyer" | "seller"; signedAt: string | null }>;
}
export interface DealDetail extends Omit<DealRow, "tcrs"> {
  leadId: string | null; leadCode: string | null; source: string; unitId: string;
  reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
  tcrs: DealTcr[];
}
/** What «سجّل صفقة» offers: the caller's leads (with their company) and the salespeople for «حد معاك». */
export interface DealForm {
  leads: Array<{ id: string; code: string; name: string; company: string | null }>;
  salespeople: DealPerson[];
}
export interface DealUnit { id: string; code: string; project: string; space: number; type: DealType; agent: DealPerson | null }

/** 9.10 · «Cost Center» (M-07 Q40): each collected deal with its campaign's share per Qualified lead; filters as the requirements list them. */
export const CostCenterFilters = z.object({
  salesId: Id.optional(),
  channel: z.string().trim().max(60).optional(),
  campaignId: Id.optional(),
  area: z.string().trim().max(80).optional(),
  from: CalendarDay.optional(),
  to: CalendarDay.optional(),
});
export type CostCenterFilters = z.infer<typeof CostCenterFilters>;
export interface CostCenterRow {
  id: string; code: string; channel: string; campaign: string | null; sales: string[]; area: string | null;
  revenue: string; marketing: string; commission: string; net: string;
}
export interface CostCenterView {
  rows: CostCenterRow[];
  byChannel: Array<{ channel: string; revenue: string; marketing: string }>;
  options: { sales: DealPerson[]; campaigns: DealPerson[] };
}
