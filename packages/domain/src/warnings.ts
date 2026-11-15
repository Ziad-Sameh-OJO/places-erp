/**
 * M-05 · warnings (إنذارات) and the improvement plan (خطة التحسين), HR's request of 15 Nov. The triggers are the month's
 * numbers the system already keeps (Excuses, absent days, late days with a deduction, approved penalties); the minimums,
 * the template and the 70% are HR settings with neutral defaults until the client confirms them.
 */

export const WARNING_TRIGGERS = ["excuses", "absences", "lateDeductions", "penalties"] as const;
export type WarningTrigger = (typeof WARNING_TRIGGERS)[number];

/** How the trigger reads in «عيد محتاج إنذار: 4 Excuses الشهر ده (القاعدة 3)». */
export const WARNING_TRIGGER_LABEL: Record<WarningTrigger, string> = { excuses: "Excuses", absences: "أيام غياب", lateDeductions: "مرات تأخير بخصم", penalties: "جزاءات" };

/** One rule HR manages: `min` or more of `trigger` in a month → the person needs a warning; `type` fills the template's blank. */
export interface WarningRule { id: string; trigger: WarningTrigger; min: number; type: string }

// neutral starting values (client to confirm): the 5th Excuse is already refused (Q31), so the 4th flags it first
export const DEFAULT_WARNING_RULES: WarningRule[] = [
  { id: "excuses", trigger: "excuses", min: 4, type: "خد Excuse زيادة" },
  { id: "absences", trigger: "absences", min: 2, type: "غياب من غير إذن" },
  { id: "late", trigger: "lateDeductions", min: 3, type: "تأخير متكرر" },
  { id: "penalties", trigger: "penalties", min: 2, type: "جزاءات متكررة" },
];

/** The saved `warningRules` as the job reads them: the valid rules, or the defaults when nothing was saved. */
export function warningRulesOf(saved: unknown): WarningRule[] {
  if (!Array.isArray(saved)) return DEFAULT_WARNING_RULES;
  return saved.filter((r): r is WarningRule => !!r && typeof r === "object" && typeof r.id === "string" && WARNING_TRIGGERS.includes(r.trigger) && Number.isInteger(r.min) && typeof r.type === "string");
}

export type MonthCounts = Record<WarningTrigger, number>;

/** The rules a person's month reached (a rule with `min` 0 is off). */
export function warningHits(rules: readonly WarningRule[], counts: MonthCounts): { rule: WarningRule; count: number; reason: string }[] {
  return rules.filter((r) => r.min > 0 && counts[r.trigger] >= r.min)
    .map((rule) => ({ rule, count: counts[rule.trigger], reason: `${counts[rule.trigger]} ${WARNING_TRIGGER_LABEL[rule.trigger]} الشهر ده (القاعدة ${rule.min})` }));
}

/** The warning letter's body; `{type}` is where the warning's type goes. */
export const DEFAULT_WARNING_TEMPLATE = "نحيطكم علمًا بأنه تم توجيه إنذار لكم بسبب: {type}.\nبرجاء الالتزام بلائحة الشركة، وفي حالة التكرار هيتم اتخاذ الإجراء المناسب.";
export const fillWarning = (template: string, type: string) => template.replaceAll("{type}", type);

/* ---- the improvement plan ---- */
export const DEFAULT_IMPROVEMENT_THRESHOLD = 70;
/** Under the threshold (%) = needs a plan; no score (no KPI card) = not judged. */
export const needsImprovement = (score: number | null, threshold: number) => score !== null && score < threshold;

export const PLAN_STATUSES = ["requested", "submitted", "follow_up", "closed"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanStep = "submit" | "follow" | "close";

/** requested → (TL) submitted → (HR) in follow-up → (HR) closed; the TL may resend while HR hasn't started following. */
export function planNext(status: PlanStatus, step: PlanStep): PlanStatus | null {
  if (step === "submit") return status === "requested" || status === "submitted" ? "submitted" : null;
  if (step === "follow") return status === "submitted" ? "follow_up" : null;
  return status === "submitted" || status === "follow_up" ? "closed" : null;
}

/** HR's «مهامي النهارده»: a sent plan whose due date came (YYYY-MM-DD). */
export const planDue = (status: PlanStatus, due: string | null, today: string) => !!due && due <= today && (status === "submitted" || status === "follow_up");
