import { z } from "zod";
import type { ClientKind } from "@places/domain";
import { Page } from "./common.ts";

/** M-10 · clients and owners: the list's filters, one file, the contact log. */

/** The list's tabs (demo: الكل · عملاء · ملاك): «عملاء» = everyone who made a deal, «ملاك» = everyone with units. */
export const ClientFilters = Page.extend({
  q: z.string().trim().max(80).optional(),
  kind: z.enum(["client", "owner"]).optional(),
});
export type ClientFilters = z.infer<typeof ClientFilters>;

/** M-10 2.1 step 5: one contact (the kind from «أنواع التواصل مع العميل»). */
export const LogInteraction = z.object({
  kind: z.string({ required_error: "اختار نوع التواصل" }).trim().min(1, "اختار نوع التواصل").max(60),
  text: z.string({ required_error: "اكتب التفاصيل" }).trim().min(1, "اكتب التفاصيل").max(1000, "التفاصيل طويلة"),
});
export type LogInteraction = z.infer<typeof LogInteraction>;

export interface ClientRow {
  id: string; name: string; company: string | null; kind: ClientKind; status: "active" | "inactive";
  /** null when the reader may not see this file's numbers (M-10 4.1: owners' numbers are hidden from sales) */
  phones: string[] | null;
  units: number; deals: number; lastContactAt: string;
}

export interface ClientSummary { clients: number; owners: number; ownersStale: number; both: number }

export interface ClientUnit { id: string; code: string; project: string; type: string; space: number; status: string; lastOwnerUpdateAt: string; stale: boolean }
export interface ClientDeal {
  id: string; code: string; unit: string; type: string; status: string; closedAt: string;
  /** which side of the deal this person is: they bought / rented (client) or it's their unit (owner) */
  side: "client" | "owner";
  due: string; paid: string;
}
export interface ClientContract { id: string; code: string; deal: string; startsOn: string; endsOn: string; status: string }
export interface ClientLead { id: string; code: string; stage: string; createdAt: string }
export interface TimelineItem { at: string; text: string; by: string | null }

export interface ClientFile extends Omit<ClientRow, "units" | "deals"> {
  preferredContact: string | null;
  units: ClientUnit[]; deals: ClientDeal[]; contracts: ClientContract[]; leads: ClientLead[];
  /** M-10 3.2: what they paid Places and what's left, as decimal strings */
  balance: { paid: string; remaining: string };
  timeline: TimelineItem[];
  interactionKinds: string[];
}
