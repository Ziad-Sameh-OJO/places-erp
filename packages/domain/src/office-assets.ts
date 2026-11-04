import { localDate } from "./business-time.ts";

/**
 * M-08 3.1 · Mokhtar's KPI (M-12) «سجل أصول المكتب متحدّث»: the office assets register is reviewed every month.
 * A review counts for the Cairo calendar month it happened in (a review at 00:30 on 1 Nov in Cairo is November's).
 */
export const assetsReviewedThisMonth = (lastReview: Date | null, now: Date): boolean =>
  lastReview !== null && localDate(lastReview).slice(0, 7) === localDate(now).slice(0, 7);
