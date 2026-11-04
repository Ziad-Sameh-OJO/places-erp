"use client";
import { useState } from "react";
import { Icon, Note, Tabs } from "@/components/ui";
import type { LeadKind } from "@places/contracts";
import { useMe } from "@/lib/me";
import { hoursText, num } from "@/lib/format";
import type { LeadQuery } from "./filters";
import { useSavedViews } from "./filters";
import { LeadKpis, LeadsToolbar, ViewsBar } from "./leads-toolbar";
import { LeadsTable } from "./leads-table";
import { LeadsBoard } from "./leads-board";
import { LeadDrawer } from "./lead-drawer";
import { NewLead } from "./new-lead";
import { OperationsQueue } from "./duplicates";
import { Fab } from "@/components/blocks";
import { useLeadBoard, useLeadOptions, useLeadSummary, useLeads, useMyCalls, useSettings, useTabCounts } from "./use-leads";

const PAGE = 50;

/** M-01 · the leads list (demo «العملاء المحتملين»): the tabs, Operations' queue, tiles, saved views, filters, list or Kanban, the SLA note. */
export function LeadsList() {
  const { can } = useMe();
  const [f, setF] = useState<LeadQuery>({});
  const [mode, setMode] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<LeadKind>("client"); // the tab; the filters stay when it changes (1.28)
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const summary = useLeadSummary(kind);
  const calls = useMyCalls().data;
  const options = useLeadOptions();
  const settings = useSettings();
  const saved = useSavedViews();
  const leads = useLeads({ ...f, kind }, page, PAGE);
  const board = useLeadBoard({ ...f, kind }, mode === "board");
  const tabs = useTabCounts(f).data;
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
      <div className="row"><Tabs value={kind} onChange={(k) => { setKind(k); setPage(1); }} items={[["client", "الليدز", tabs?.client], ["broker", "البروكرز", tabs?.broker]]} /></div>
      <OperationsQueue />
      {calls?.goal && (
        <Note>{calls.goal.period === "day"
          ? <>مكالماتك النهارده: <b>{num(calls.count)}</b> من {calls.goal.target} (بند في الـ KPIs بتاعتك).</>
          : <>مكالماتك آخر 7 أيام: <b>{num(calls.count)}</b> من {calls.goal.target} (بند Calls &amp; Broadcast في الـ KPIs بتاعتك).</>}</Note>
      )}
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
        {can("leads", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />ليد جديد</button>}
      </div>
      {failed ? <Note kind="warn">{failed}</Note> : mode === "board"
        ? <LeadsBoard board={board.data} canMove={can("leads", "edit")} onOpen={setOpen} />
        : <LeadsTable leads={leads.data?.items ?? []} onOpen={setOpen} />}
      {creating && <NewLead kind={kind} onClose={() => setCreating(false)} onOpenLead={(id) => { setCreating(false); setOpen(id); }} />}
      {can("leads", "create") && <Fab onClick={() => setCreating(true)} label="ليد جديد" />}
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
          الـ SLA{s.holidayMode && <> <b>(النهارده إجازة رسمية)</b></>}: تنبيه بعد {hoursText(s.holidayMode ? s.slaRules.holidayWarnAfter : s.slaRules.warnAfter)} من غير أكشن،
          والليد بيتسحب أوتوماتيك بعد {hoursText(s.holidayMode ? s.slaRules.holidayPullAfter : s.slaRules.pullAfter)} للسيلز اللي عليه الدور.
        </Note>
      )}
    </>
  );
}
