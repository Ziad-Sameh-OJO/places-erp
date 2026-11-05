import { z } from "zod";
import { CONTRACT_STATUSES, type ContractStatus, type InstallmentState } from "@places/domain";
import { CalendarDay, Id, Money, Page } from "./common.ts";

/** «جدول الأقساط» (M-11 3.1): automatic (value ÷ count, one every n months) or written line by line. */
const Schedule = z.union([
  z.object({ count: z.number().int().min(1, "قسط واحد على الأقل").max(120, "120 قسط بالكتير"), everyMonths: z.number().int().min(1).max(24) }),
  z.object({ lines: z.array(z.object({ dueOn: CalendarDay, amount: Money })).min(1, "جدول الأقساط فاضي").max(120) }),
]);

/** M-11 2.1 step 1: the salesperson uploads the contract on the deal (PDF · start · end · value · yearly increase · table). */
export const CreateContract = z.object({
  dealId: Id,
  startsOn: CalendarDay,
  endsOn: CalendarDay,
  value: Money,
  escalation: z.number().min(0, "الزيادة السنوية بين 0 و 100%").max(100, "الزيادة السنوية بين 0 و 100%").default(0),
  fileId: Id, // the signed PDF, a finished upload (0.9)
  schedule: Schedule,
});
export type CreateContract = z.infer<typeof CreateContract>;

export const ContractFilters = Page.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  /** «قرّبت تخلص»: active with 90 days or less left */
  ending: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});
export type ContractFilters = z.infer<typeof ContractFilters>;

export interface ContractRow {
  id: string; code: string; dealId: string; dealCode: string; client: string; unitCode: string;
  startsOn: string; endsOn: string; value: string; escalation: number; status: ContractStatus;
  endingSoon: boolean; daysLeft: number; paid: string;
}
/** A payment on an installment and its receipt number (C-501-1 = installment 1 of C-501, like the demo; /2 for a second payment). */
export interface PaymentRow { id: string; amount: string; paidOn: string; receiptNo: string }
export interface InstallmentRow { id: string; dueOn: string; amount: string; paid: string; state: InstallmentState; payments: PaymentRow[] }

/** «سجّل دفعة» (M-11 2.1 step 4): Finance records what the client paid on an installment; part of it is allowed (2.3). */
export const RecordPayment = z.object({ amount: Money, paidOn: CalendarDay.optional() });
export type RecordPayment = z.infer<typeof RecordPayment>;

/** «تقرير التحصيل» for a month: what fell due, what was collected (by payment), and the Aging now. */
export interface CollectionReport {
  month: string; due: string; collected: string; aging: [string, string, string, string];
  items: Array<{ contractId: string; code: string; client: string; unitCode: string; dueOn: string; paidOn: string; amount: string; receiptNo: string; paymentId: string }>;
}
export interface ContractDetail extends ContractRow {
  nextYearValue: string; file: { id: string; name: string } | null; installments: InstallmentRow[]; createdAt: string;
  endedOn: string | null; endReason: string | null; penalty: string | null;
  /** a value change waiting for management (M-11 2.2) */
  pending: { value: string; reason: string; by: string | null; at: string; mine: boolean } | null;
}

/** The calendar (M-11 5.3): one month "YYYY-MM". */
export const ContractMonth = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر لازم يبقى YYYY-MM") });
export type ContractMonth = z.infer<typeof ContractMonth>;
export interface CalendarItem { contractId: string; code: string; client: string; kind: "installment" | "end"; amount: string | null; state: InstallmentState | null }
export interface ContractCalendar { month: string; byDay: Record<string, CalendarItem[]> }
/** The demo's tiles, the renewals card and the Aging card (M-11 5.1 · 6.1), in the caller's scope. */
export interface ContractSummary {
  active: number; endingSoon: number; late: { count: number; amount: string }; paid: string;
  aging: [string, string, string, string]; renewals: ContractRow[];
}
/** «عقد جديد»: the caller's approved deals that have no contract yet. */
export interface ContractForm { deals: Array<{ id: string; code: string; company: string; unitCode: string }> }

/** M-11 2.3 «فسخ العقد»: the reason and the penalty (0 when there's none). */
export const TerminateContract = z.object({
  reason: z.string().trim().min(2, "اكتب سبب الفسخ").max(500, "السبب طويل"),
  penalty: Money.refine((m) => !m.startsWith("-"), "الغرامة مايبقاش بالسالب").default("0"),
});
export type TerminateContract = z.infer<typeof TerminateContract>;

/** M-11 2.2: a new value after signing, waiting for management's approval. */
export const ProposeValue = z.object({ value: Money, reason: z.string().trim().min(2, "اكتب سبب التغيير").max(500, "السبب طويل") });
export type ProposeValue = z.infer<typeof ProposeValue>;
export const DecideValue = z.object({ decision: z.enum(["approve", "reject"]) });
export type DecideValue = z.infer<typeof DecideValue>;
