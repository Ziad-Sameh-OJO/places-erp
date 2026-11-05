import { z } from "zod";
import { CalendarDay, Money } from "./common.ts";
import { UnitInput } from "./inventory.ts";
import { CreateLead } from "./leads.ts";

/**
 * 13.1 · the old data from the fixed templates (M-03 «استيراد البيانات القديمة من قالب Excel موحّد»). Every cell comes
 * as text: numbers are read here, then the module's own form schema checks the row.
 */
type Raw = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v.replace(/,/g, "")));
const plain = (v: string | undefined) => v?.replace(/,/g, "");
/** Excel drops a mobile's leading 0 when the cell is a number (1001234567). */
const phone = (v: string) => (/^1\d{9}$/.test(v.replace(/\D/g, "")) ? `0${v.replace(/\D/g, "")}` : v);
const raw = (v: unknown) => (v ?? {}) as Raw;

/** One template for every type; «الـ Agent» is the employee's name, the API turns it into their id. */
export const UnitImportRow = z.preprocess((v) => {
  const r = raw(v);
  return { ...r, space: num(r.space), parking: num(r.parking) ?? 0, pricePerSqm: plain(r.pricePerSqm), leasePerSqm: plain(r.leasePerSqm), ownerPhone: r.ownerPhone && phone(r.ownerPhone) };
}, UnitInput);
export type UnitImportRow = z.infer<typeof UnitImportRow>;

/** Several mobiles in one cell are split by comma, «،», «/» or a new line. */
export const LeadImportRow = z.preprocess((v) => {
  const r = raw(v);
  return { ...r, phones: (r.phones ?? "").split(/[,،;/\n]+/).map((s) => phone(s.trim())).filter(Boolean), space: num(r.space), budget: plain(r.budget) };
}, CreateLead.pick({ name: true, company: true, phones: true, area: true, type: true, space: true, budget: true, channel: true, note: true })
  .extend({ arrivedAt: CalendarDay.optional() })); // when it came in: old leads keep their day out of today's numbers
export type LeadImportRow = z.infer<typeof LeadImportRow>;

/** The company archive (M-01 · Companys archive 28/10): the Company table's columns. */
export const CompanyImportRow = z.preprocess((v) => {
  const r = raw(v);
  return { ...r, currentSpace: num(r.currentSpace), averageRent: plain(r.averageRent), annualEscalation: num(r.annualEscalation) };
}, z.object({
  name: z.string().trim().min(1, "اكتب اسم الشركة").max(160, "اسم الشركة طويل"),
  category: z.string().trim().min(1, "اكتب الكاتيجوري").max(80),
  number: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactTitle: z.string().trim().max(120).optional(),
  email: z.string().trim().email("الإيميل غلط").optional(),
  currentLocation: z.string().trim().max(200).optional(),
  currentSpace: z.number({ invalid_type_error: "المساحة رقم" }).int("المساحة رقم صحيح").positive().optional(),
  contractStart: CalendarDay.optional(),
  contractEnd: CalendarDay.optional(),
  averageRent: Money.optional(),
  annualEscalation: z.number({ invalid_type_error: "الزيادة رقم" }).min(0).max(100, "الزيادة نسبة لحد 100").optional(),
  feedback: z.string().trim().max(2000).optional(),
}));
export type CompanyImportRow = z.infer<typeof CompanyImportRow>;
