"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { LeadBoard, LeadRow } from "@places/contracts";
import { type LeadStage, isQualifiedAfter } from "@places/domain";
import { Kanban } from "@/components/blocks";
import { Avatar, Chip, Icon, useAction, useToast } from "@/components/ui";
import { ago, num, short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { slaText, slaTone, stageTone } from "./lead-bits";
import { useChangeStage } from "./use-leads";
import { WhatsAppQuestion } from "./whatsapp-question";

/** The lane dot's colour as a CSS variable (the chips' tones). */
const LANE_COLOR: Record<string, string> = { ok: "ok", warn: "warn", bad: "bad", info: "info", acc: "accent", "": "ink-3" };

/**
 * The demo's Kanban: a lane per stage, each card coloured by its SLA. Dropping a card on another lane changes its
 * stage (the API checks the permission and the scope). Visit needs a date and units, so it isn't a drop (1.9).
 */
export function LeadsBoard({ board, canMove, onOpen }: { board: LeadBoard | undefined; canMove: boolean; onOpen: (id: string) => void }) {
  const t = useTranslations("leads");
  const run = useAction();
  const toast = useToast();
  const changeStage = useChangeStage();
  const fields = useFields("leads"); // M-09: the card leaves a hidden field out
  const [ask, setAsk] = useState<LeadRow | null>(null); // «بعتله واتساب؟» right after No Answer (1.18)
  const move = (l: LeadRow, stage: string) => {
    if (stage === l.stage) return;
    if (stage === "Visit") { toast(t("board.setVisit")); return; }
    const willQualify = !l.qualified && isQualifiedAfter(false, stage as LeadStage); // the toast says so, like the demo
    void run(async () => { await changeStage(l.id, stage); if (stage === "No Answer") setAsk(l); },
      willQualify ? t("board.movedQualified", { name: l.name, stage: serverText(stage) }) : t("board.moved", { name: l.name, stage: serverText(stage) }));
  };
  const lanes = (board?.lanes ?? []).map((l) => ({ key: l.stage, title: serverText(l.stage), tone: LANE_COLOR[stageTone(l.stage)], items: l.items, count: l.total }));
  return (
    <>
    {ask && <WhatsAppQuestion lead={ask} onClose={() => setAsk(null)} />}
    <Kanban className="leads-board" lanes={lanes} itemKey={(l) => l.id} empty={t("board.dropHere")} onOpen={(l) => onOpen(l.id)}
      cardClass={(l) => `lead-card ${l.sla ? `sla-${slaTone(l.sla)}` : ""}`}
      {...(canMove ? { onMove: (l: LeadRow, lane: string) => move(l, lane) } : {})}
      card={(l) => (
        <>
          <div className="row"><b className="spacer">{l.name}</b>{l.qualified && <Icon name="star" />}</div>
          <span className="hint">{l.area ? serverText(l.area) : "—"} · {l.type}{l.space != null && <> · {t.rich("board.sqm", { n: num(l.space), s: (c) => <span className="num">{c}</span> })}</>}{fields.shows("budget") && <> · {short(l.budget)}</>}</span>
          <div className="row">
            {l.assignedTo && <Avatar id={l.assignedTo.id} name={l.assignedTo.name} sm />}
            <span className="hint spacer">{l.channel}</span>
            {l.sla ? <Chip tone={slaTone(l.sla)}>{slaText(l.sla, t)}</Chip> : <span className="hint">{ago(l.createdAt)}</span>}
          </div>
        </>
      )} />
    </>
  );
}
