import { z } from "zod";
import { CalendarDay, Id } from "./common.ts";

/** M-05 · «الترفيه والاحتفالات» (HR, 15 Nov): an event HR plans. No departments = everyone. */
export const FunDayInput = z.object({
  title: z.string().trim().min(2, "اكتب اسم الاحتفال").max(120),
  date: CalendarDay,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الساعة مش صحيحة").nullish(),
  place: z.string().trim().max(120).nullish(),
  description: z.string().trim().min(2, "اكتب هيحصل إيه في اليوم").max(2000),
  /** one of the caller's own finished image uploads; null on edit = take the image off */
  imageFileId: Id.nullish(),
  departments: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
export type FunDayInput = z.infer<typeof FunDayInput>;

export const FunDayYearQuery = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() });
export type FunDayYearQuery = z.infer<typeof FunDayYearQuery>;

export interface FunDayView {
  id: string;
  title: string;
  date: string;
  time: string | null;
  place: string | null;
  description: string;
  image: string | null;
  imageFileId: string | null;
  departments: string[];
  cancelled: boolean;
}

/** HR's plan of a year: every event (cancelled too), the one-click starters with their suggested date, the official
 * holidays of that year and the departments to choose from. */
export interface FunDayPlan {
  year: number;
  events: FunDayView[];
  starters: Array<{ key: string; title: string; date: string | null }>;
  holidays: Array<{ from: string; to: string; label: string }>;
  departments: string[];
}
