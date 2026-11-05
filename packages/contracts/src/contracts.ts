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
export interface InstallmentRow { id: string; dueOn: string; amount: string; paid: string; state: InstallmentState }
export interface ContractDetail extends ContractRow {
  nextYearValue: string; file: { id: string; name: string } | null; installments: InstallmentRow[]; createdAt: string;
}
