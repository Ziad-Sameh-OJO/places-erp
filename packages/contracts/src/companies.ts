import { z } from "zod";
import { CalendarDay, Money, Page } from "./common.ts";

/**
 * M-01 · «شيت الشركات» (1.20). The sheet's columns are the client's archive's (requirements M-01 «شيت الشركات · …»):
 * feedback · company name · number · name · title · email · current location · current space · start / end contract
 * date · average current price rent · annual escalation · date. Name and number are required.
 */
export const CompanyFilters = Page.extend({
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(120).optional(),
  /** 1.21 report: only companies whose current contract ends within this many days from today (the demo's 90) */
  endingWithin: z.coerce.number().int().min(1).max(730).optional(),
});
export type CompanyFilters = z.infer<typeof CompanyFilters>;

/** Demo's quick row: «شركة جديدة (Outbound)» · the category · the number. */
export const NewCompany = z.object({
  name: z.string({ required_error: "اكتب اسم الشركة" }).trim().min(1, "اكتب اسم الشركة").max(160, "اسم الشركة طويل"),
  category: z.string({ required_error: "اختار الكاتيجوري" }).trim().min(1, "اختار الكاتيجوري").max(80),
  number: z.string({ required_error: "اكتب الرقم" }).trim().min(1, "اكتب الرقم").max(40, "الرقم طويل"),
});
export type NewCompany = z.infer<typeof NewCompany>;

/** «عدّل» a company in the sheet: every column of the archive; an empty one is cleared (null). Name, category, number required. */
const opt = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional().transform((v) => v ?? null);
export const CompanyUpdate = z.object({
  name: NewCompany.shape.name,
  category: NewCompany.shape.category,
  number: NewCompany.shape.number,
  contactName: opt(z.string().trim().max(120)),
  contactTitle: opt(z.string().trim().max(120)),
  email: opt(z.string().trim().email("الإيميل غلط").max(200)),
  currentLocation: opt(z.string().trim().max(200)),
  currentSpace: opt(z.number({ invalid_type_error: "المساحة رقم" }).int("المساحة رقم صحيح").positive("المساحة أكبر من صفر")),
  contractStart: opt(CalendarDay),
  contractEnd: opt(CalendarDay),
  averageRent: opt(Money),
  annualEscalation: opt(z.number({ invalid_type_error: "الزيادة رقم" }).min(0).max(100, "الزيادة نسبة لحد 100")),
  feedback: opt(z.string().trim().max(2000)),
}).refine((c) => !c.contractStart || !c.contractEnd || c.contractStart <= c.contractEnd, { path: ["contractEnd"], message: "نهاية العقد قبل بدايته" });
export type CompanyUpdate = z.infer<typeof CompanyUpdate>;

/** «أضف للشيت» for a company that came on a lead: Telesales picks its category. */
export const PendingCompanyAdd = z.object({ category: z.string({ required_error: "اختار الكاتيجوري" }).trim().min(1, "اختار الكاتيجوري").max(80) });
export type PendingCompanyAdd = z.infer<typeof PendingCompanyAdd>;

export interface CompanyRow {
  id: string; name: string; category: string; number: string | null; contactName: string | null; contactTitle: string | null; email: string | null;
  currentLocation: string | null; currentSpace: number | null; contractStart: string | null; contractEnd: string | null;
  averageRent: string | null; annualEscalation: string | null; feedback: string | null; outbound: boolean; date: string;
}
export interface CompanySheet {
  items: CompanyRow[]; total: number; page: number; pageSize: number;
  /** each category of the settings list with how many companies it has */
  categories: { name: string; count: number }[];
  /** the person's own Outbound companies in the last 7 days (KPI: 15 a week) */
  outboundThisWeek: number;
}
/** A company someone wrote on a lead that isn't in the sheet yet (M-01 6.1). */
export interface PendingCompany { id: string; name: string; lead: { id: string; code: string }; by: string; at: string }
export interface AddedCompany { id: string; name: string; category: string; leadCode: string | null }
