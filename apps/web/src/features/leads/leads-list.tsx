"use client";
import { useEffect, useState } from "react";
import { Icon, Note, Tabs } from "@/components/ui";
import type { LeadKind } from "@places/contracts";
import { useMe } from "@/lib/me";
import { num } from "@/lib/format";
import { durationText, keepsCompaniesSheet } from "@places/domain";
import type { LeadQuery } from "./filters";
import { useSavedViews } from "./filters";
import { LeadKpis, LeadsToolbar, ViewsBar } from "./leads-toolbar";
import { LeadsTable } from "./leads-table";
import { LeadsBoard } from "./leads-board";
import { LeadDrawer } from "./lead-drawer";
import { NewLead } from "./new-lead";
import { OperationsQueue } from "./duplicates";
import { BulkNew } from "./bulk";
import { OldDataImport } from "../imports/old-data-import";
import { SecondCalls } from "./second-calls";
import { CompaniesSheet, usePendingCompanies } from "./companies";
import { Fab } from "@/components/blocks";
import { useLeadBoard, useLeadOptions, useLeadSummary, useLeads, useMyCalls, useSettings, useTabCounts } from "./use-leads";

const PAGE = 50;

/** M-01 · the leads list (demo «العملاء المحتملين»): the tabs, Operations' queue, tiles, saved views, filters, list or Kanban, the SLA note. */
export function LeadsList() {
  const { me, can } = useMe();
  const keepsSheet = keepsCompaniesSheet(me?.roles ?? []); // comfort only: the API decides (M-01 2.1)
  const newCompanies = usePendingCompanies(keepsSheet).data ?? [];
  const [f, setF] = useState<LeadQuery>({});
  const [mode, setMode] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<LeadKind>("client"); // the tab; the filters stay when it changes (1.28)
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [companies, setCompanies] = useState(false);
  // links from the home board and the notifications: «/leads?open=<id>» opens the lead, «/leads?new=1» the form
  const canCreate = can("leads", "create");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOpen(q.get("open"));
    if (q.get("companies") === "1") setCompanies(true); // the new-company notification's link (1.20)
  }, []);
  useEffect(() => { if (canCreate && new URLSearchParams(window.location.search).get("new") === "1") setCreating(true); }, [canCreate]);
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
      <SecondCalls onOpen={setOpen} />
      {newCompanies.length > 0 && <Note kind="warn">فيه {newCompanies.length} شركة جديدة محتاجة تتضاف لشيت الشركات. <button className="btn sm" onClick={() => setCompanies(true)}>افتح شيت الشركات</button></Note>}
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
        {(keepsSheet || can("leads", "import")) && <button className="btn ghost" onClick={() => setCompanies(true)}><Icon name="building" />شيت الشركات</button>}
        {can("leads", "import") && <button className="btn ghost" onClick={() => setBulk(true)}><Icon name="upload" />إدخال جماعي (Import)</button>}
        {can("leads", "import") && <><OldDataImport kind="leads" /><OldDataImport kind="companies" /></>}{/* 13.1 */}
        {can("leads", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />ليد جديد</button>}
      </div>
      {failed ? <Note kind="warn">{failed}</Note> : mode === "board"
        ? <LeadsBoard board={board.data} canMove={can("leads", "edit")} onOpen={setOpen} />
        : <LeadsTable leads={leads.data?.items ?? []} onOpen={setOpen} />}
      {creating && <NewLead kind={kind} onClose={() => setCreating(false)} onOpenLead={(id) => { setCreating(false); setOpen(id); }} />}
      {companies && <CompaniesSheet onClose={() => setCompanies(false)} />}
      {bulk && <BulkNew settings={settings.data} onClose={() => setBulk(false)} />}
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
          الـ SLA{s.holidayMode && <> <b>(النهارده إجازة رسمية)</b></>}: تنبيه بعد {durationText(s.holidayMode ? s.slaRules.holidayWarnAfter : s.slaRules.warnAfter)} من غير أكشن،
          والليد بيتسحب أوتوماتيك بعد {durationText(s.holidayMode ? s.slaRules.holidayPullAfter : s.slaRules.pullAfter)} للسيلز اللي عليه الدور.
        </Note>
      )}
    </>
  );
}
