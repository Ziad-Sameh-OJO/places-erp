"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadBoard, LeadRow } from "@places/contracts";
import { type LeadStage, boardLanes, isPickableStage, isQualifiedAfter } from "@places/domain";
import { Kanban } from "@/components/blocks";
import { Avatar, Chip, Icon, useAction, useToast } from "@/components/ui";
import { ago, num, short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useFields, useMe } from "@/lib/me";
import { DealForm } from "../deals/deal-form";
import { slaText, slaTone, stageTone } from "./lead-bits";
import { useChangeStage } from "./use-leads";
import { WhatsAppQuestion } from "./whatsapp-question";

/** The lane dot's colour as a CSS variable (the chips' tones). */
const LANE_COLOR: Record<string, string> = { ok: "ok", warn: "warn", bad: "bad", info: "info", acc: "accent", "": "ink-3" };

/**
 * The demo's Kanban: a lane per stage, each card coloured by its SLA. Dropping a card on another lane changes its
 * stage (the API checks the permission and the scope). Visit / Meeting and Done Deal open their forms instead (1.32).
 */
export function LeadsBoard({ board, canMove, onOpen, onVisit }: {
  board: LeadBoard | undefined; canMove: boolean; onOpen: (id: string) => void; onVisit: (id: string, kind: "Visit" | "Meeting") => void;
}) {
  const t = useTranslations("leads");
  const { can } = useMe();
  const qc = useQueryClient();
  const [deal, setDeal] = useState<string | null>(null); // «سجّل الصفقة» on the lead dropped on Done Deal
  const run = useAction();
  const toast = useToast();
  const changeStage = useChangeStage();
  const fields = useFields("leads"); // M-09: the card leaves a hidden field out
  const [ask, setAsk] = useState<LeadRow | null>(null); // «بعتله واتساب؟» right after No Answer (1.18)
  const move = (l: LeadRow, stage: string) => {
    if (stage === l.stage) return;
    if (!isPickableStage(stage)) { toast(t("board.notPickable", { stage: serverText(stage) })); return; } // a stage kept for old leads only
    // 1.32 · demo DROP.stage: Visit / Meeting need a time and units — the lead opens on «الزيارات» with that kind; closing
    // it leaves the card where it was (the stage moves only when it's booked, the API's 1.9)
    if (stage === "Visit" || stage === "Meeting") { onVisit(l.id, stage); toast(t("drawer.setVisit", { kind: stage })); return; }
    // Done Deal opens «سجّل الصفقة» on this lead; registering it moves the stage (deals.service markDoneDeal), cancelling
    // doesn't. A lead that was never Interested isn't in the deal form (M-02), so it moves first, as in the demo.
    if (stage === "Done Deal" && can("deals", "create") && l.qualified) { void qc.invalidateQueries({ queryKey: ["deals", "form"] }); setDeal(l.id); return; }
    const willQualify = !l.qualified && isQualifiedAfter(false, stage as LeadStage); // the toast says so, like the demo
    void run(async () => {
      await changeStage(l.id, stage);
      if (stage === "No Answer") setAsk(l);
      if (stage === "Done Deal" && can("deals", "create")) { void qc.invalidateQueries({ queryKey: ["deals", "form"] }); setDeal(l.id); }
    },
      willQualify ? t("board.movedQualified", { name: l.name, stage: serverText(stage) }) : t("board.moved", { name: l.name, stage: serverText(stage) }));
  };
  const lanes = boardLanes(board?.lanes ?? []).map((l) => ({ key: l.stage, title: serverText(l.stage), tone: LANE_COLOR[stageTone(l.stage)], items: l.items, count: l.total }));
  return (
    <>
    {ask && <WhatsAppQuestion lead={ask} onClose={() => setAsk(null)} />}
    {deal && <DealForm leadId={deal} onClose={() => setDeal(null)} onSaved={() => { setDeal(null); void qc.invalidateQueries({ queryKey: ["leads"] }); }} />}
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
