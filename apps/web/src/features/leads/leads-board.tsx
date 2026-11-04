"use client";
import type { LeadRow } from "@places/contracts";
import { LEAD_STAGES, type LeadStage, isQualifiedAfter } from "@places/domain";
import { Kanban } from "@/components/blocks";
import { Avatar, Chip, Icon, useAction, useToast } from "@/components/ui";
import { ago, num, short } from "@/lib/format";
import { slaText, slaTone, stageTone } from "./lead-bits";
import { useChangeStage } from "./use-leads";

/** The lane dot's colour as a CSS variable (the chips' tones). */
const LANE_COLOR: Record<string, string> = { ok: "ok", warn: "warn", bad: "bad", info: "info", acc: "accent", "": "ink-3" };
/** The demo shows at most 30 cards per lane. */
const PER_LANE = 30;

/**
 * The demo's Kanban: a lane per stage, each card coloured by its SLA. Dropping a card on another lane changes its
 * stage (the API checks the permission and the scope). Visit needs a date and units, so it isn't a drop (1.9).
 */
export function LeadsBoard({ leads, canMove }: { leads: LeadRow[]; canMove: boolean }) {
  const run = useAction();
  const toast = useToast();
  const changeStage = useChangeStage();
  const move = (l: LeadRow, stage: string) => {
    if (stage === l.stage) return;
    if (stage === "Visit") { toast("حدد ميعاد الـ Visit والوحدات"); return; }
    const willQualify = !l.qualified && isQualifiedAfter(false, stage as LeadStage); // the toast says so, like the demo
    void run(() => changeStage(l.id, stage), willQualify ? `${l.name} بقى ${stage} واتعلّم Qualified` : `${l.name} بقى ${stage}`);
  };
  const lanes = LEAD_STAGES.map((s) => ({ key: s, title: s, tone: LANE_COLOR[stageTone(s)], items: leads.filter((l) => l.stage === s).slice(0, PER_LANE) }));
  return (
    <Kanban className="leads-board" lanes={lanes} itemKey={(l) => l.id} empty="اسحب ليد هنا"
      cardClass={(l) => `lead-card ${l.sla ? `sla-${slaTone(l.sla)}` : ""}`}
      {...(canMove ? { onMove: (l: LeadRow, lane: string) => move(l, lane) } : {})}
      card={(l) => (
        <>
          <div className="row"><b className="spacer">{l.name}</b>{l.qualified && <Icon name="star" />}</div>
          <span className="hint">{l.area || "—"} · {l.type}{l.space != null && <> · <span className="num">{num(l.space)}</span> م</>} · {short(l.budget)}</span>
          <div className="row">
            {l.assignedTo && <Avatar id={l.assignedTo.id} name={l.assignedTo.name} sm />}
            <span className="hint spacer">{l.channel}</span>
            {l.sla ? <Chip tone={slaTone(l.sla)}>{slaText(l.sla)}</Chip> : <span className="hint">{ago(l.createdAt)}</span>}
          </div>
        </>
      )} />
  );
}
