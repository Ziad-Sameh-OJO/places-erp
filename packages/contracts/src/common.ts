import { z } from "zod";

/** Money on the wire is a decimal string in EGP ("12500.50") — never a float. */
export const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "amount in EGP with up to 2 decimals");
/** Egyptian mobile numbers, normalised to 11 digits. */
export const EgyptianMobile = z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().regex(/^01[0-25]\d{8}$/, "رقم موبايل مصري"));
export const Id = z.string().min(1).max(40);
/** A calendar day "YYYY-MM-DD" that exists: 2026-13-45 and 2026-02-30 are refused (the round trip must give it back). */
export const CalendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ لازم يبقى YYYY-MM-DD").refine((d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}, "تاريخ مش موجود");

export const Page = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export type Page = z.infer<typeof Page>;
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
