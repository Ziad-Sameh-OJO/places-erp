"use client";
import { useNewParam } from "@/lib/new-param";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExportButton, Icon, Note, Tabs } from "@/components/ui";
import type { DraftKind, LeadKind } from "@places/contracts";
import { useMe } from "@/lib/me";
import { num } from "@/lib/format";
import { keepsCompaniesSheet } from "@places/domain";
import type { LeadQuery } from "./filters";
import { toParams, useSavedViews } from "./filters";
import { BulkBar } from "./bulk-bar";
import { useDuration } from "./lead-bits";
import { LeadKpis, LeadsToolbar, ViewsBar } from "./leads-toolbar";
import { LeadsTable } from "./leads-table";
import { LeadsBoard } from "./leads-board";
import { LeadDrawer } from "./lead-drawer";
import { NewLead } from "./new-lead";
import { OperationsQueue } from "./duplicates";
import { BulkNew } from "./bulk";
import { SecondCalls } from "./second-calls";
import Link from "next/link";
import { usePendingCompanies } from "./companies";
import { DraftAdminAlarm, DraftView } from "./drafts";
import { Fab } from "@/components/blocks";
import { useLeadBoard, useLeadOptions, useLeadSummary, useLeads, useMyCalls, useSettings, useTabCounts } from "./use-leads";
import { ListRequestsModal, useListRequests } from "../inventory/list-requests";

const PAGE = 50;

/** M-01 · the leads list (demo «العملاء المحتملين»): the tabs, Operations' queue, tiles, saved views, filters, list or Kanban, the SLA note. */
export function LeadsList() {
  const t = useTranslations("leads.list");
  const duration = useDuration();
  const { me, can } = useMe();
  const keepsSheet = keepsCompaniesSheet(me?.roles ?? []); // comfort only: the API decides (M-01 2.1)
  const newCompanies = usePendingCompanies(keepsSheet).data ?? [];
  const [f, setF] = useState<LeadQuery>({});
  const [mode, setMode] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<LeadKind>("client"); // the tab; the filters stay when it changes (1.28)
  const [open, setOpen] = useState<string | null>(null);
  const [visit, setVisit] = useState<"Visit" | "Meeting" | undefined>(); // the drawer opened by a Kanban drop on Visit / Meeting (1.32)
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  // 2.32 · demo leads.js: a Team Leader's «اطلب List من الانفنتوري» (who may ask is the API's answer)
  const [lists, setLists] = useState(false);
  const asksLists = useListRequests(can("tickets", "view")).data?.canAsk;
  // links from the home board and the notifications: «/leads?open=<id>» opens the lead, «/leads?new=1» the form
  const canCreate = can("leads", "create");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOpen(q.get("open"));
    if (q.get("companies") === "1") return window.location.replace("/companies"); // older notifications' link (1.20): the sheet has its own page now
    if (q.get("lists") === "1") setLists(true); // «الـ List … جاهزة» (2.32)
  }, []);
  // «جديد» from any page (0.16): «?new=1» the form, «?new=bulk» the bulk entry
  useNewParam("1", () => setCreating(true), canCreate);
  useNewParam("bulk", () => setBulk(true), can("leads", "import"));
  const [draftTab, setDraftTab] = useState<DraftKind | null>(null);
  // «/leads?draft=admin»: the Draft Admin Alarm on «مهامي النهارده» (1.34) opens that tab (only shown to whom may see it)
  useEffect(() => { const d = new URLSearchParams(window.location.search).get("draft"); if (d === "draft" || d === "admin") setDraftTab(d); }, []);
  // the bulk bar's picks (demo shell.js): whoever may change leads or hand them out; cleared when the list changes
  const [picked, setPicked] = useState<string[]>([]);
  const canPick = can("leads", "edit") || can("leads", "approve");
  useEffect(() => setPicked([]), [f, page, kind, mode]);
  const summary = useLeadSummary(kind);
  const calls = useMyCalls().data;
  const options = useLeadOptions();
  const settings = useSettings();
  const saved = useSavedViews();
  // 0.15: a header click sorts every page in the API (back to page 1); not a filter, so saved views don't keep it
  const [sort, setSort] = useState<Pick<LeadQuery, "sort" | "dir">>({});
  const leads = useLeads({ ...f, kind, ...sort }, page, PAGE);
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
  // «Draft» (1.26) and «Draft Admin» (1.27): only for the people «قواعد الليدز» names — the API sends counts, else null.
  // The Draft Admin's count is what still waits for a decision, or all of it once everything was reviewed (demo).
  const draftTabs: [DraftKind, string, number][] = [
    ...(s?.drafts != null ? [["draft", "Draft", s.drafts] as [DraftKind, string, number]] : []),
    ...(s?.draftAdmin ? [["admin", "Draft Admin", s.draftAdmin.waiting || s.draftAdmin.total] as [DraftKind, string, number]] : []),
  ];
  const tabRow = (
    <div className="row">
      <Tabs<LeadKind | DraftKind> value={draftTab ?? kind} onChange={(k) => { const d = k === "draft" || k === "admin"; setDraftTab(d ? k : null); if (!d) setKind(k); setPage(1); }}
        items={[["client", t("leads"), tabs?.client], ["broker", t("brokers"), tabs?.broker], ...draftTabs]} />
    </div>
  );
  if (draftTab && draftTabs.some(([k]) => k === draftTab)) {
    return <>{tabRow}<DraftView kind={draftTab} onOpen={setOpen} />{open && <LeadDrawer ids={[]} id={open} onGo={setOpen} onClose={() => setOpen(null)} />}</>;
  }

  return (
    <>
      {tabRow}
      <DraftAdminAlarm onOpen={() => setDraftTab("admin")} />
      <OperationsQueue />
      <SecondCalls onOpen={setOpen} />
      {newCompanies.length > 0 && <Note kind="warn">{t("newCompanies", { count: newCompanies.length })} <Link className="btn sm" href="/companies">{t("openCompanies")}</Link></Note>}
      {calls?.goal && (
        <Note>{calls.goal.period === "day"
          ? t.rich("callsToday", { count: num(calls.count), target: calls.goal.target, b: (c) => <b>{c}</b> })
          : t.rich("callsWeek", { count: num(calls.count), target: calls.goal.target, b: (c) => <b>{c}</b> })}</Note>
      )}
      {asksLists && <div className="row end"><button className="btn ghost sm" onClick={() => setLists(true)}><Icon name="list" />{t("askList")}</button></div>}
      <ViewsBar f={f} s={s} views={saved.views} onPick={filter} onAdd={saved.add} onRemove={saved.remove} />
      {s && <LeadKpis s={s} onReset={() => filter({})} />}
      <LeadsToolbar f={f} set={filter} settings={settings.data} options={options.data} />
      <div className="row">
        <div className="seg" role="group">
          <button aria-pressed={mode === "list"} title={t("list")} onClick={() => setMode("list")}><Icon name="list" /><span>{t("list")}</span></button>
          <button aria-pressed={mode === "board"} title="Kanban" onClick={() => setMode("board")}><Icon name="board" /><span>Kanban</span></button>
        </div>
        <span className="hint num">{t("count", { count: total, n: num(total) })}</span>
        <span className="spacer" />
        {can("leads", "import") && <button className="btn ghost" onClick={() => setBulk(true)}><Icon name="upload" />{t("bulk")}</button>}
        <ExportButton module="leads" path="/leads/export" query={toParams({ ...f, kind, ...sort }, 1, 100)} filename={t("exportFile")} label={t("export")} />
        {can("leads", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />{t("newLead")}</button>}
      </div>
      {failed ? <Note kind="warn">{failed}</Note> : mode === "board"
        ? <LeadsBoard board={board.data} canMove={can("leads", "edit")} onOpen={(id) => { setVisit(undefined); setOpen(id); }} onVisit={(id, k) => { setVisit(k); setOpen(id); }} />
        : <LeadsTable leads={leads.data?.items ?? []} onOpen={setOpen} sort={sort} onSort={(by, dir) => { setSort({ sort: by, dir }); setPage(1); }} {...(canPick ? { picked, onPick: setPicked } : {})} />}
      {mode === "list" && picked.length > 0 && <BulkBar ids={picked} onDone={() => setPicked([])} />}
      {creating && <NewLead kind={kind} onClose={() => setCreating(false)} onOpenLead={(id) => { setCreating(false); setOpen(id); }} />}
      {lists && <ListRequestsModal onClose={() => setLists(false)} />}
      {bulk && <BulkNew settings={settings.data} onClose={() => setBulk(false)} />}
      {can("leads", "create") && <Fab onClick={() => setCreating(true)} label={t("newLead")} />}
      {open && <LeadDrawer ids={ids} id={open} onGo={setOpen} onClose={() => { setOpen(null); setVisit(undefined); }} visit={visit} />}
      {!failed && mode === "list" && pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
      {s && (
        <Note>
          {t("slaTitle")}{s.holidayMode && <> <b>{t("holiday")}</b></>}{t("slaNote", {
            warn: duration(s.holidayMode ? s.slaRules.holidayWarnAfter : s.slaRules.warnAfter),
            pull: duration(s.holidayMode ? s.slaRules.holidayPullAfter : s.slaRules.pullAfter),
          })}
        </Note>
      )}
    </>
  );
}
