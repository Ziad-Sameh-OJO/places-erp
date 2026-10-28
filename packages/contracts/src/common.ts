import { z } from "zod";

/** Money on the wire is a decimal string in EGP ("12500.50") — never a float. */
export const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "amount in EGP with up to 2 decimals");
/** Egyptian mobile numbers, normalised to 11 digits. */
export const EgyptianMobile = z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().regex(/^01[0-25]\d{8}$/, "رقم موبايل مصري"));
export const Id = z.string().min(1).max(40);

export const Page = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export type Page = z.infer<typeof Page>;
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
