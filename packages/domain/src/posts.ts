/**
 * M-04 · the Content plan: a post's state on the calendar, and when its Reminder is due.
 * 2.4 (25): «الـ Content plan: Reminder بس» — the system reminds at the post's time and records when it really went
 * out; it doesn't publish anything itself. 7.1: «بوست ميعاده النهارده الساعة 7 → يوصل Reminder في الميعاد».
 */
import { localDate } from "./business-time.ts";

export interface PlannedPost { readonly at: Date; readonly approved: boolean; readonly publishedAt: Date | null; readonly reminderSentAt: Date | null }

export type PostState = "published" | "waiting" | "today" | "scheduled";
/** The demo's chips: اتنشر · مستني موافقة · Reminder النهارده · متجدول. */
export const POST_STATE_LABEL: Record<PostState, string> = { published: "اتنشر", waiting: "مستني موافقة", today: "Reminder النهارده", scheduled: "متجدول" };

export function postState(p: PlannedPost, now: Date): PostState {
  if (p.publishedAt) return "published";
  if (!p.approved) return "waiting";
  return localDate(p.at) === localDate(now) ? "today" : "scheduled";
}

/** The Reminder goes out once, at the post's time, for an approved post that isn't out yet. */
export const reminderDue = (p: PlannedPost, now: Date): boolean =>
  p.approved && !p.publishedAt && !p.reminderSentAt && p.at.getTime() <= now.getTime();
