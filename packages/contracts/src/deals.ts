import { z } from "zod";
import { DEAL_STATUSES, DEAL_TYPES, type DealStatus, type DealType } from "@places/domain";
import { Id, Money, Page } from "./common.ts";

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
});
export type ReviewDeal = z.infer<typeof ReviewDeal>;

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
}
export interface DealDetail extends DealRow {
  leadId: string | null; leadCode: string | null; source: string; unitId: string;
  reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
}
/** What «سجّل صفقة» offers: the caller's leads (with their company) and the salespeople for «حد معاك». */
export interface DealForm {
  leads: Array<{ id: string; code: string; name: string; company: string | null }>;
  salespeople: DealPerson[];
}
export interface DealUnit { id: string; code: string; project: string; space: number; type: DealType; agent: DealPerson | null }
