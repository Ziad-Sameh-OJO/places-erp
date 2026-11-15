"use client";
import { useTranslations } from "next-intl";
import { periodChoices, quarterDays, quarterOfDay } from "@places/domain";

/** "2026-Q4" → "year=2026&quarter=4" (the API's PeriodQuery); "" when no period is picked. */
export const periodParams = (p: string) => (p ? `year=${p.slice(0, 4)}&quarter=${p.slice(-1)}` : "");

/** The quarter a «من / لحد» range is exactly (the leads' date filter), else "". */
export function rangePeriod(from?: string, to?: string): string {
  const q = from ? quarterOfDay(from) : "";
  return q && quarterDays(q).from === from && quarterDays(q).to === to ? q : "";
}

/**
 * 14.12 · the shared «السنة والربع» filter: Q4 2025 … two quarters ahead, latest first. `value` "" = no quarter: `all`
 * offers it as «كل الفترات», `empty` under the screen's own name for its default («الشهر ده»…).
 */
export function PeriodPicker({ value, onChange, all, empty, past = false }: { value: string; onChange: (p: string) => void; all?: boolean; empty?: string; past?: boolean }) {
  const t = useTranslations("ui.periodPicker");
  const now = new Date();
  // `past`: only quarters that ended (the hand-typed figures)
  const choices = periodChoices(now, past ? -1 : 2);
  return (
    <label className="date-f">
      <span>{t("label")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("label")}>
        {(all || empty) && <option value="">{empty ?? t("all")}</option>}
        {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    </label>
  );
}
