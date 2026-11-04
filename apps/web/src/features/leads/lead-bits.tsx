"use client";
/** Small pieces both the list and the Kanban use, in the demo's words and colours (demo leads.js). */
import type { LeadRow } from "@places/contracts";
import { Avatar, Chip } from "@/components/ui";

type Tone = "" | "ok" | "warn" | "bad" | "info" | "acc";
/** Stage colours: the demo's LVL map; every other stage is the accent. */
const STAGE_TONE: Record<string, Tone> = { "Fresh": "info", "Not Interested": "bad", "No Answer": "warn", "Done Deal": "ok", "Cancellation": "bad", "Hold": "" };
export const stageTone = (stage: string): Tone => STAGE_TONE[stage] ?? "acc";
export const StageChip = ({ stage }: { stage: string }) => <Chip tone={stageTone(stage)}>{stage}</Chip>;

type Sla = NonNullable<LeadRow["sla"]>;
/** «pull» is the demo's red («bad»). */
export const slaTone = (s: Sla) => (s.level === "pull" ? "bad" : s.level);
/** The demo's SLA wording: «اتسحب» · «تنبيه TL · باقي 20 د» · «باقي 1س 30د». */
export function slaText(s: Sla) {
  if (s.level === "pull") return "اتسحب";
  if (s.level === "warn") return `تنبيه TL · باقي ${s.minutesLeft} د`;
  return s.minutesLeft >= 60 ? `باقي ${Math.floor(s.minutesLeft / 60)}س ${s.minutesLeft % 60}د` : `باقي ${s.minutesLeft} د`;
}

/** The SLA cell of the table: the text over a bar that fills toward the pull. */
export const SlaBar = ({ sla }: { sla: Sla }) => {
  const tone = slaTone(sla);
  return (
    <div className={`sla ${tone}`}>
      <span>{slaText(sla)}</span>
      <div className={`bar ${tone === "ok" ? "" : tone}`}><i style={{ width: `${sla.pct}%` }} /></div>
    </div>
  );
};

export const Who = ({ person }: { person: LeadRow["assignedTo"] }) =>
  person ? <span className="who"><Avatar id={person.id} name={person.name} sm /><span>{person.name}</span></span> : <span className="hint">—</span>;
