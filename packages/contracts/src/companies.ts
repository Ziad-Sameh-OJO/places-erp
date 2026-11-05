import { z } from "zod";
import { Page } from "./common.ts";

/**
 * M-01 · «شيت الشركات» (1.20). The sheet's columns are the client's archive's (requirements M-01 «شيت الشركات · …»):
 * feedback · company name · number · name · title · email · current location · current space · start / end contract
 * date · average current price rent · annual escalation · date. Name and number are required.
 */
export const CompanyFilters = Page.extend({
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(120).optional(),
});
export type CompanyFilters = z.infer<typeof CompanyFilters>;

/** Demo's quick row: «شركة جديدة (Outbound)» · the category · the number. */
export const NewCompany = z.object({
  name: z.string({ required_error: "اكتب اسم الشركة" }).trim().min(1, "اكتب اسم الشركة").max(160, "اسم الشركة طويل"),
  category: z.string({ required_error: "اختار الكاتيجوري" }).trim().min(1, "اختار الكاتيجوري").max(80),
  number: z.string({ required_error: "اكتب الرقم" }).trim().min(1, "اكتب الرقم").max(40, "الرقم طويل"),
});
export type NewCompany = z.infer<typeof NewCompany>;

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
