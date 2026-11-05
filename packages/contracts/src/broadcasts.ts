import { z } from "zod";
import { Id } from "./common.ts";

/** M-04 2.1 step 7: «صورة + نص + لوجو» with the Hot Inventory units. */
export const BroadcastInput = z.object({
  text: z.string().trim().min(3, "اكتب النص اللي السيلز هيبعته لعملائه").max(2000),
  logo: z.boolean().default(true),
  hotUnitIds: z.array(Id).max(50).default([]),
});
export type BroadcastInput = z.infer<typeof BroadcastInput>;

/** M-04 2.3 (24): Done = sent, plus the other units they broadcast. */
export const BroadcastDone = z.object({ otherUnits: z.array(z.string().trim().min(1).max(20)).max(30).default([]) });
export type BroadcastDone = z.infer<typeof BroadcastDone>;

export interface BroadcastRow {
  id: string;
  text: string;
  logo: boolean;
  hotUnits: Array<{ id: string; code: string }>;
  approved: boolean;
  createdAt: string;
  /** the salespeople who pressed Done, with the other units they broadcast */
  sent: Array<{ id: string; name: string; otherUnits: string[]; doneAt: string }>;
  /** salespeople who haven't yet */
  pending: number;
}

export interface BroadcastBoard {
  items: BroadcastRow[];
  /** M-12: this week's Broadcasts with Hot Inventory, of 2 */
  week: { sent: number; of: number };
}

/** A salesperson's Broadcast task. */
export interface MyBroadcast { id: string; text: string; logo: boolean; hotUnits: Array<{ id: string; code: string }>; createdAt: string; doneAt: string | null }
