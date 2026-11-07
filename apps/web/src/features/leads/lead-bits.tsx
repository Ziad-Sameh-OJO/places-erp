"use client";
/** Small pieces both the list and the Kanban use, in the demo's words and colours (demo leads.js). */
import { useLocale, useTranslations } from "next-intl";
import type { LeadRow } from "@places/contracts";
import { durationText } from "@places/domain";
import { Avatar, Chip } from "@/components/ui";
import { serverText } from "@/lib/server-text";

export type LeadsT = ReturnType<typeof useTranslations<"leads">>;

type Tone = "" | "ok" | "warn" | "bad" | "info" | "acc";
/** Stage colours: the demo's LVL map; every other stage is the accent. */
const STAGE_TONE: Record<string, Tone> = { "Fresh": "info", "Not Interested": "bad", "No Answer": "warn", "Done Deal": "ok", "Cancellation": "bad", "Hold": "" };
export const stageTone = (stage: string): Tone => STAGE_TONE[stage] ?? "acc";
export const StageChip = ({ stage }: { stage: string }) => <Chip tone={stageTone(stage)}>{serverText(stage)}</Chip>;

type Sla = NonNullable<LeadRow["sla"]>;
/** «pull» is the demo's red («bad»). */
export const slaTone = (s: Sla) => (s.level === "pull" ? "bad" : s.level);
/** The demo's SLA wording: «اتسحب» · «تنبيه TL · باقي 20 د» · «باقي 1س 30د». */
export function slaText(s: Sla, t: LeadsT) {
  if (s.level === "pull") return t("sla.pulled");
  if (s.level === "warn") return t("sla.warn", { min: s.minutesLeft });
  return s.minutesLeft >= 60 ? t("sla.leftHours", { h: Math.floor(s.minutesLeft / 60), m: s.minutesLeft % 60 }) : t("sla.leftMin", { min: s.minutesLeft });
}

/**
 * A length of time in words («ساعتين و30 دقيقة»): Arabic straight from the domain's durationText (the API's wording),
 * other languages from the messages.
 */
export function useDuration() {
  const locale = useLocale();
  const t = useTranslations("leads.duration");
  return (minutes: number) => {
    if (locale === "ar") return durationText(minutes);
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return !m ? t("hours", { count: h }) : h ? t("both", { hours: t("hours", { count: h }), minutes: t("minutes", { count: m }) }) : t("minutes", { count: m });
  };
}

/** The SLA cell of the table: the text over a bar that fills toward the pull. */
export const SlaBar = ({ sla }: { sla: Sla }) => {
  const t = useTranslations("leads");
  const tone = slaTone(sla);
  return (
    <div className={`sla ${tone}`}>
      <span>{slaText(sla, t)}</span>
      <div className={`bar ${tone === "ok" ? "" : tone}`}><i style={{ width: `${sla.pct}%` }} /></div>
    </div>
  );
};

export const Who = ({ person }: { person: LeadRow["assignedTo"] }) =>
  person ? <span className="who"><Avatar id={person.id} name={person.name} sm /><span>{person.name}</span></span> : <span className="hint">—</span>;
