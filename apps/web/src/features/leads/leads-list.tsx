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
import { LeadDrawer } from "./lead-drawer";
import { useLeadBoard, useLeadOptions, useLeadSummary, useLeads, useSettings } from "./use-leads";

const PAGE = 50;

/** M-01 · the leads list (demo «العملاء المحتملين»): tiles, saved views, filters, list or Kanban, the SLA note. */
export function LeadsList() {
  const { can } = useMe();
  const [f, setF] = useState<LeadQuery>({});
  const [mode, setMode] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const summary = useLeadSummary();
  const options = useLeadOptions();
  const settings = useSettings();
  const saved = useSavedViews();
  const leads = useLeads(f, page, PAGE);
  const board = useLeadBoard(f, mode === "board");
  // a filter the API refuses (e.g. «لحد» before «من») says why, instead of quietly keeping the previous results
  const failed = (mode === "board" ? board.error : leads.error)?.message;
  const filter = (next: LeadQuery) => { setF(next); setPage(1); };
  const total = failed ? 0 : mode === "board" && board.data ? board.data.lanes.reduce((n, l) => n + l.total, 0) : leads.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const s = summary.data;
  // prev / next in the drawer walk what's on screen: this page of the list, or the board's cards lane by lane
  const ids = mode === "board" ? (board.data?.lanes ?? []).flatMap((l) => l.items.map((x) => x.id)) : (leads.data?.items ?? []).map((x) => x.id);

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
      {failed ? <Note kind="warn">{failed}</Note> : mode === "board"
        ? <LeadsBoard board={board.data} canMove={can("leads", "edit")} onOpen={setOpen} />
        : <LeadsTable leads={leads.data?.items ?? []} onOpen={setOpen} />}
      {open && <LeadDrawer ids={ids} id={open} onGo={setOpen} onClose={() => setOpen(null)} />}
      {!failed && mode === "list" && pages > 1 && (
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
