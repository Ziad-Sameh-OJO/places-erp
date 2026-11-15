/**
 * M-05 · the employee file (HR, 15 Nov): the papers HR keeps per employee and the monthly 1-to-1's coverage.
 * The required papers are a setting HR manages (`employeeDocTypes`); this starter list waits for the client to confirm.
 */
export const DEFAULT_DOC_TYPES: readonly string[] = ["البطاقة (وش وضهر)", "شهادة الميلاد", "شهادة التخرج", "فيش وتشبيه", "صور شخصية", "شهادة التجنيد"];

/** The required papers not uploaded yet, in the setting's order. */
export const missingDocs = (required: readonly string[], uploaded: readonly (string | null)[]): string[] =>
  required.filter((t) => !uploaded.includes(t));

/** The month's last 7 days: HR's «مهامي النهارده» lists who still has no 1-to-1 this month. */
export function lastWeekOfMonth(today: string): boolean {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number(today.slice(8, 10)) > days - 7;
}

/** The report's «ملخص الإجابات»: the answered questions, «سؤال: إجابة» joined. */
export const answersSummary = (answers: Record<string, string>): string =>
  Object.entries(answers).filter(([, a]) => a.trim()).map(([q, a]) => `${q}: ${a.trim()}`).join(" · ");
