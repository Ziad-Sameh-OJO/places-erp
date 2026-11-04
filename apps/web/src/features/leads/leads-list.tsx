"use client";
import { useState } from "react";
import { Icon, Note } from "@/components/ui";
import { useMe } from "@/lib/me";
import { hoursText, num } from "@/lib/format";
import type { LeadQuery } from "./filters";
import { useSavedViews } from "./filters";
import { LeadKpis, LeadsToolbar, ViewsBar } from "./leads-toolbar";
import { LeadsTable } from "./leads-table";
import { LeadsBoard } from "./leads-board";
import { useLeadOptions, useLeadSummary, useLeads, useSettings } from "./use-leads";

const PAGE = 50;
/** The board shows every lane at once, so it asks for the most the API gives in one page (30 cards per lane shown). */
const BOARD_PAGE = 100;

/** M-01 · the leads list (demo «العملاء المحتملين»): tiles, saved views, filters, list or Kanban, the SLA note. */
export function LeadsList() {
  const { can } = useMe();
  const [f, setF] = useState<LeadQuery>({});
  const [mode, setMode] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const summary = useLeadSummary();
  const options = useLeadOptions();
  const settings = useSettings();
  const saved = useSavedViews();
  const leads = useLeads(f, mode === "board" ? 1 : page, mode === "board" ? BOARD_PAGE : PAGE);
  const filter = (next: LeadQuery) => { setF(next); setPage(1); };
  const total = leads.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const s = summary.data;

  return (
    <>
      <ViewsBar f={f} s={s} views={saved.views} onPick={filter} onAdd={saved.add} onRemove={saved.remove} />
      {s && <LeadKpis s={s} onReset={() => filter({})} />}
      <LeadsToolbar f={f} set={filter} settings={settings.data} options={options.data} />
      <div className="row">
        <div className="seg" role="group">
          <button aria-pressed={mode === "list"} title="قايمة" onClick={() => setMode("list")}><Icon name="list" /><span>قايمة</span></button>
          <button aria-pressed={mode === "board"} title="Kanban" onClick={() => setMode("board")}><Icon name="board" /><span>Kanban</span></button>
        </div>
        <span className="hint num">{num(total)} ليد</span>
        <span className="spacer" />
      </div>
      {mode === "board"
        ? <LeadsBoard leads={leads.data?.items ?? []} canMove={can("leads", "edit")} />
        : <LeadsTable leads={leads.data?.items ?? []} />}
      {mode === "list" && pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      {s && (
        <Note>
          {s.holidayMode
            ? <>الـ SLA <b>(وضع الإجازة)</b>: تنبيه للـ Team Leader بعد {hoursText(s.slaRules.holidayWarnAfter)}، وسحب بعد {hoursText(s.slaRules.holidayPullAfter)}</>
            : <>الـ SLA: تنبيه للـ Team Leader بعد {hoursText(s.slaRules.warnAfter)} من غير أكشن، والليد بيتسحب أوتوماتيك بعد {hoursText(s.slaRules.pullAfter)} للسيلز اللي عليه الدور</>}.
        </Note>
      )}
    </>
  );
}
