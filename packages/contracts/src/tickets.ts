import { z } from "zod";
import { TICKET_PRIORITIES, ticketType, type DepartmentSla } from "@places/domain";
import { Page } from "./common.ts";

/** M-06 · the demo's tabs: طلباتي · مسندة لقسمي · متأخرة · اتقفلت · الكل */
export const TicketView = z.enum(["mine", "assigned", "late", "closed", "all"]);
export type TicketView = z.infer<typeof TicketView>;

export const TicketFilters = Page.extend({
  view: TicketView.default("all"),
  q: z.string().trim().max(80).optional(), // TK-12, the request's words, or who opened it
});
export type TicketFilters = z.infer<typeof TicketFilters>;

export const CreateTicket = z.object({
  type: z.string().refine((k) => !!ticketType(k) && !ticketType(k)!.system, "نوع التذكرة مش موجود"),
  department: z.string().trim().max(60).optional(), // only for a type that doesn't have its own department
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  title: z.string().trim().min(3, "اكتب الطلب").max(2000, "الطلب طويل · 2000 حرف بالكتير"),
});
export type CreateTicket = z.infer<typeof CreateTicket>;

export const TicketReply = z.object({
  text: z.string().trim().min(1, "اكتب رد").max(2000, "الرد طويل · 2000 حرف بالكتير"),
  status: z.enum(["In Progress", "Resolved"]).optional(), // only the department moves the status
});
export type TicketReply = z.infer<typeof TicketReply>;

export const TransferTicket = z.object({ department: z.string().trim().min(1, "اختار القسم").max(60) });
export type TransferTicket = z.infer<typeof TransferTicket>;

export const SlaReportQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر لازم يبقى YYYY-MM").optional() });
export type SlaReportQuery = z.infer<typeof SlaReportQuery>;

export interface TicketRow {
  id: string;
  code: string;
  type: string;
  typeLabel: string;
  department: string;
  title: string;
  priority: string;
  status: string;
  from: { id: string; name: string };
  createdAt: string;
  firstReplyAt: string | null;
  late: boolean;
  events: number;
}

export interface TicketEventView { kind: string; text: string; by: { id: string; name: string } | null; at: string }

export interface TicketDetail extends Omit<TicketRow, "events"> {
  events: TicketEventView[];
  /** what the caller may do here (the server checks again on every action) */
  can: { reply: boolean; handle: boolean; transfer: boolean; close: boolean };
}

export interface TicketSummary { open: number; late: number; closed: number; department: string | null; avgReplyMinutes: number | null }

export interface TicketOptions {
  types: Array<{ key: string; label: string; department: string | null; slaHours: number; highSlaHours: number | null }>;
  departments: string[];
}

export interface SlaReport { month: string; rows: DepartmentSla[] }
