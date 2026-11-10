/**
 * M-04 · the Broadcast: Rahma's message goes to sales as a send task (2.1 steps 7-8); Done means they sent it, with a
 * field for other units they broadcast (2.3 · 24). M-12 (Rahma 4): «الـ Broadcast في مواعيده الثابتة (يومين في
 * الأسبوع) مع قايمة Hot Inventory».
 */
import { localDate } from "./business-time.ts";

/** M-12 Rahma 4: two Broadcasts a week, each with its Hot Inventory list. */
export const BROADCASTS_PER_WEEK = 2;

/** The Cairo week a day falls in, Saturday to Friday (the office's week: Friday is the day off). */
export function weekOf(now: Date): { from: string; to: string } {
  const today = localDate(now);
  const t = Date.parse(`${today}T00:00:00Z`);
  const back = (new Date(t).getUTCDay() + 1) % 7; // Saturday → 0
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: day(t - back * 86_400_000), to: day(t + (6 - back) * 86_400_000) };
}

/** This week's Broadcasts that count: approved and with a Hot Inventory list. */
export function broadcastsThisWeek(list: readonly { createdAt: Date; approved: boolean; hotUnits: number }[], now: Date): number {
  const w = weekOf(now);
  return list.filter((b) => b.approved && b.hotUnits > 0 && localDate(b.createdAt) >= w.from && localDate(b.createdAt) <= w.to).length;
}

/**
 * M-04 2.3 · «الحد اليومي» for WhatsApp (setting `whatsappDailyLimit`, 250): the company's numbers mustn't get banned.
 * The salespeople send by hand, so the system counts each Broadcast Done as a fixed number of messages — the demo's 25
 * (home.js bcDone) until the client says what a Done counts. It only warns; nothing is ever blocked.
 */
export const WHATSAPP_PER_DONE = 25;
export const whatsappSentToday = (donesToday: number): number => donesToday * WHATSAPP_PER_DONE;

/** The demo's bar and chip (marketing.js): «bad» past 85% of the limit, «warn» past 60%. */
export function whatsappLimitTone(sent: number, limit: number): "ok" | "warn" | "bad" {
  const pct = limit > 0 ? (sent / limit) * 100 : sent > 0 ? 100 : 0;
  return pct > 85 ? "bad" : pct > 60 ? "warn" : "ok";
}
