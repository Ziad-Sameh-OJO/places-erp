import { z } from "zod";
import { TICKET_PRIORITIES, ticketType, type DepartmentSla } from "@places/domain";
import { Page } from "./common.ts";

/** M-06 · the demo's tabs: طلباتي · مسندة لقسمي · متأخرة · اتقفلت · الكل, and «تيكتات ليا» (assigned to me by name, 15 Nov) */
export const TicketView = z.enum(["mine", "forMe", "assigned", "late", "closed", "all"]);
export type TicketView = z.infer<typeof TicketView>;

export const TicketFilters = Page.extend({
  view: TicketView.default("all"),
  q: z.string().trim().max(80).optional(), // TK-12, the request's words, or who opened it
  assignee: z.string().trim().max(40).optional(), // a user id
  department: z.string().trim().max(60).optional(),
});
export type TicketFilters = z.infer<typeof TicketFilters>;

export const CreateTicket = z.object({
  type: z.string().refine((k) => !!ticketType(k) && !ticketType(k)!.system, "نوع التذكرة مش موجود"),
  department: z.string().trim().max(60).optional(), // only for a type that doesn't have its own department
  // 15 Nov: named people instead of the whole department (user ids)
  assigneeIds: z.array(z.string().trim().min(1).max(40)).max(20, "20 شخص بالكتير").default([]),
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

/** 15 Nov: transfer to people (replaces who has it) or add people to it. */
export const AssignTicket = z.object({
  userIds: z.array(z.string().trim().min(1).max(40)).min(1, "اختار شخص").max(20, "20 شخص بالكتير"),
  add: z.boolean().default(false),
});
export type AssignTicket = z.infer<typeof AssignTicket>;

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
  /** false = sent to the named assignees, not the whole department (15 Nov) */
  forDepartment: boolean;
  assignees: Array<{ id: string; name: string }>;
  createdAt: string;
  firstReplyAt: string | null;
  late: boolean;
  events: number;
}

export interface TicketEventView { kind: string; text: string; by: { id: string; name: string } | null; at: string }

export interface TicketDetail extends Omit<TicketRow, "events"> {
  events: TicketEventView[];
  /** what the caller may do here (the server checks again on every action) */
  can: { reply: boolean; handle: boolean; transfer: boolean; close: boolean; assign: boolean; take: boolean };
}

export interface TicketSummary { open: number; late: number; closed: number; department: string | null; avgReplyMinutes: number | null }

export interface TicketOptions {
  types: Array<{ key: string; label: string; department: string | null; slaHours: number; highSlaHours: number | null }>;
  departments: string[];
  /** the active people a ticket can be sent to by name */
  people: Array<{ id: string; name: string; department: string | null }>;
}

export interface SlaReport { month: string; rows: DepartmentSla[] }
