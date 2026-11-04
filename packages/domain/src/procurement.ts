/**
 * M-08 · purchase requests: who may approve (Q44 · Q45 · 4.1), the receipt rule (0.9 / KPI M-12), and the approver's
 * reminder after one working day (2.4). Pure rules; the API passes in the facts (budget left, the approver's standing).
 */
import { type Piasters, egp, formatEGP } from "./money.ts";
import { PLACES_CALENDAR, type WorkCalendar, workingMinutesBetween } from "./business-time.ts";

export const PURCHASE_STATUSES = ["Pending", "Approved", "Rejected", "Settled", "Posted"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Q44: any approver releases up to 50,000; above it only Ahmed or Safwat. */
export const APPROVAL_LIMIT: Piasters = egp(50_000);
/** 0.9 / KPI M-12: above 10,000 a receipt or two quotes must be attached before the request is sent. */
export const ATTACHMENT_THRESHOLD: Piasters = egp(10_000);
/** 2.4: the approver answers within one working day (11:00–19:00 = 8 working hours), or is reminded. */
export const APPROVAL_REMINDER_MINUTES = 8 * 60;

export interface Approver {
  id: string;
  /** Super Admin (management): the only one who may let a request go over its line's budget (Q45) */
  management: boolean;
  /** may approve above APPROVAL_LIMIT (Q44) */
  aboveLimit: boolean;
}

export interface PendingRequest {
  amount: Piasters;
  createdById: string;
  /** what is left in the line's budget now (null: the line has no active budget) — Q46: only payments count */
  budgetLeft: Piasters | null;
}

/** Would this request take its line over the budget that is left (Q45)? */
export const overBudget = (r: Pick<PendingRequest, "amount" | "budgetLeft">): boolean => r.budgetLeft !== null && r.amount > r.budgetLeft;

/** Why `who` can't approve the request, or null when they can. Rejecting is open to every approver except the requester. */
export function approvalProblem(r: PendingRequest, who: Approver): string | null {
  if (r.createdById === who.id) return "مينفعش توافق على طلب انت اللي عامله"; // 4.1: Mokhtar can't approve his own
  if (overBudget(r) && !who.management) return "الطلب ده هيعدّي الـ Budget · مايتصرفش غير بموافقة الإدارة";
  if (r.amount > APPROVAL_LIMIT && !who.aboveLimit) return `المبلغ أكتر من ${formatEGP(APPROVAL_LIMIT)} · الموافقة لأحمد أو صفوت بس`;
  return null;
}

/** 0.9: above 10,000 at least one file (the receipt, or the two quotes) is attached. */
export const attachmentProblem = (amount: Piasters, files: number): string | null =>
  amount > ATTACHMENT_THRESHOLD && files < 1 ? "فوق 10,000 جنيه لازم إيصال أو عرضين أسعار مرفقين" : null;

/** 2.4: a pending request waited a full working day for its approver. */
export const approvalOverdue = (createdAt: Date, now: Date, cal: WorkCalendar = PLACES_CALENDAR): boolean =>
  workingMinutesBetween(createdAt, now, cal) >= APPROVAL_REMINDER_MINUTES;
