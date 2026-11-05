import { z } from "zod";

/** M-04 2.1 step 6: a post in the Content plan — the design / video, the description, the publish time. `at` is Cairo time «YYYY-MM-DDTHH:mm». */
export const PostInput = z.object({
  title: z.string().trim().min(2, "اكتب البوست").max(200),
  channel: z.string().trim().min(1, "اختار الـ Channel").max(60),
  campaignId: z.string().max(40).optional().or(z.literal("").transform(() => undefined)),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "ميعاد النشر مش مظبوط"),
  description: z.string().trim().max(2000).optional(),
});
export type PostInput = z.infer<typeof PostInput>;

export const PostQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر لازم يبقى YYYY-MM").optional() });
export type PostQuery = z.infer<typeof PostQuery>;

export interface PostRow {
  id: string;
  title: string;
  channel: string;
  campaign: { id: string; name: string } | null;
  at: string;
  description: string | null;
  approved: boolean;
  publishedAt: string | null;
  /** published · waiting (the manager's review) · today (Reminder today) · scheduled */
  state: "published" | "waiting" | "today" | "scheduled";
}
