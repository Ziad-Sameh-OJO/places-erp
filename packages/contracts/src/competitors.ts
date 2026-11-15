import { z } from "zod";

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر لازم يبقى YYYY-MM");

/** 14.14 · the monthly competitors report: which month's rows. */
export const CompetitorsQuery = z.object({ month: Month });
export type CompetitorsQuery = z.infer<typeof CompetitorsQuery>;

/** A competitor on that month's report: its name and what they put out. */
export const CompetitorInput = z.object({
  month: Month,
  name: z.string().trim().min(1, "اكتب اسم المنافس").max(120),
  note: z.string().trim().max(1000).optional(),
});
export type CompetitorInput = z.infer<typeof CompetitorInput>;

/** The marketing manager's «قوي / مش قوي»; null takes the rating back. */
export const CompetitorStrength = z.object({ strong: z.boolean().nullable() });
export type CompetitorStrength = z.infer<typeof CompetitorStrength>;

export interface CompetitorRow { id: string; month: string; name: string; note: string | null; strong: boolean | null }
