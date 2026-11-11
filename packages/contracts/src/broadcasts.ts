import { z } from "zod";
import { Id } from "./common.ts";

export const BROADCAST_MAX_IMAGES = 10;

/**
 * M-04 2.1 step 7: the picture(s) + text with the Hot Inventory units. The images are the sender's own finished
 * uploads (`/files/uploads`), tied to the Broadcast when it's created. The «حط اللوجو» switch is gone (client, Nov 11):
 * the logo goes on the image itself.
 */
export const BroadcastInput = z.object({
  text: z.string().trim().min(3, "اكتب النص اللي السيلز هيبعته لعملائه").max(2000),
  imageFileIds: z.array(Id).max(BROADCAST_MAX_IMAGES, `أقصى عدد ${BROADCAST_MAX_IMAGES} صور`).default([]),
  hotUnitIds: z.array(Id).max(50).default([]),
});

/** A Broadcast image: its short inline link (null when storage can't sign it) and a download link for the salesperson. */
export interface BroadcastImage { id: string; name: string; url: string | null; download: string | null }
export type BroadcastInput = z.infer<typeof BroadcastInput>;

/** M-04 2.3 (24): Done = sent, plus the other units they broadcast. */
export const BroadcastDone = z.object({ otherUnits: z.array(z.string().trim().min(1).max(20)).max(30).default([]) });
export type BroadcastDone = z.infer<typeof BroadcastDone>;

export interface BroadcastRow {
  id: string;
  text: string;
  images: BroadcastImage[];
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
  /** M-04 2.3 · «حد الواتساب اليومي»: today's messages (each Done counts WHATSAPP_PER_DONE) of the daily limit; it warns only */
  whatsapp: { sent: number; limit: number; tone: "ok" | "warn" | "bad" };
}

/**
 * M-04 2.1 step 7 · a Hot Inventory search result: the unit as the inventory sheet shows it (code, type, project ·
 * area, space, finishing, floor, price, cover photo) so marketing picks it without opening the sheet. Hidden fields
 * (M-09) come back blank.
 */
export interface HotUnitOption {
  id: string;
  code: string;
  type: string;
  project: string;
  area: string;
  space: number;
  condition: string;
  floor: string | null;
  pricePerSqm: string | null;
  totalPrice: string | null;
  divisible: boolean;
  photo: string | null;
  photoCount: number;
}

/** A salesperson's Broadcast task. */
export interface MyBroadcast { id: string; text: string; images: BroadcastImage[]; hotUnits: Array<{ id: string; code: string }>; createdAt: string; doneAt: string | null }
