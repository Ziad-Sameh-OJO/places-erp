"use client";
import type { LeadRow } from "@places/contracts";
import { Chip, Table } from "@/components/ui";
import { ago, money, num } from "@/lib/format";
import { SlaBar, StageChip, Who } from "./lead-bits";

/** The demo's list: one row per lead, on phones a card per lead (Table does that). */
export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  return (
    <Table head={["الليد", "Area · Type", "Budget", "Channel · Campaign", "Sales", "Stage", "SLA"]} empty="مفيش بيانات تطابق الفلتر"
      rows={leads.map((l) => [
        <span key="l"><b>{l.name}</b><span className="sub"><span className="mono">{l.code}</span></span><span className="sub mono">{l.phones.join(" · ")}</span></span>,
        <span key="a">{l.area || "—"}<span className="sub">{l.type}{l.space != null && <> · <span className="num">{num(l.space)}</span> م</>}</span></span>,
        <span key="b" className="n">{money(l.budget)}</span>,
        <span key="c">{l.channel}<span className="sub">{l.campaign?.name ?? "—"}</span></span>,
        <span key="s"><Who person={l.assignedTo} />{l.ownedByTelesales && <span className="sub">مع Telesales</span>}</span>,
        <div key="st" className="row"><StageChip stage={l.stage} />{l.qualified && <Chip tone="ok">Qualified</Chip>}</div>,
        l.sla ? <SlaBar key="sla" sla={l.sla} /> : <span key="sla" className="hint">{ago(l.createdAt)}</span>,
      ])} />
  );
}
