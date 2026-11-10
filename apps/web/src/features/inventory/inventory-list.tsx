"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { keepsInventory, seesInventoryTiles } from "@places/domain";
import { Fab, KpiTile } from "@/components/blocks";
import { Chip, Empty, ExportButton, Icon, Note, Table, Tabs, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useFields, useMe } from "@/lib/me";
import { num, short } from "@/lib/format";
import { TYPE_TONE, cell, columnsFor } from "./unit-bits";
import { UnitDrawer } from "./unit-drawer";
import { UnitForm } from "./unit-form";
import { OwnerUpdateButton } from "./owner-update";
import { OldDataImport } from "../imports/old-data-import";
import { AreaTabsBar } from "./area-tabs";
import { TeamTaskModal } from "./team-tasks";
import { DailyReportModal } from "./daily-report";
import { ListOfOptionsBar } from "./list-of-options";
import { ListRequestsModal, useListRequests } from "./list-requests";
import { type UnitQuery, toParams, useAreaTabs, useUnit, useUnitOptions, useUnitSummary, useUnitTabs, useUnits } from "./use-units";
import { serverText } from "@/lib/server-text";

const PAGE = 50;
type TypeTab = "all" | "Rent" | "Resale" | "Income" | "Primary" | "closed";

/**
 * M-03 · مخزون الوحدات (demo inventory.js): the tiles, Rent · Resale · Income in one list with a type tab, the
 * filters, the sheet or the folders (cards), and a unit's drawer. Sales see confirmed units only (Q15, the API).
 */
export function InventoryList() {
  const t = useTranslations("inventory");
  const me = useMe();
  const insider = keepsInventory({ can: me.can });
  const [tab, setTab] = useState<TypeTab>("all");
  const [f, setF] = useState<UnitQuery>({});
  const [mode, setMode] = useState<"table" | "drive">("table");
  const [page, setPage] = useState(1);
  // M-03 6.1: the units picked for a List of options, kept across pages and filters until cleared
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // a notification links to one unit (the close to confirm, Q16)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("unit")) setOpen(q.get("unit"));
    if (q.get("report")) setReport(true); // «التقرير اليومي جاهز» (2.18)
    if (q.get("lists")) setLists(true); // «طلب List من …» (2.32)
    if (q.get("missing")) setF({ missing: "true" }); // «مهامي النهارده»: «N وحدة تانية ناقصها بيانات» (2.20)
  }, []);
  const [form, setForm] = useState<"new" | "edit" | null>(null);
  const [teamTask, setTeamTask] = useState(false);
  const [report, setReport] = useState(false);
  // 2.32 · the inventory team's «طلبات الـ Lists» (who prepares them is the API's answer)
  const [lists, setLists] = useState(false);
  const prepares = useListRequests(me.can("tickets", "view")).data?.canSend;
  const qc = useQueryClient();
  const run = useAction();
  // the rented / sold sheet keeps its own type and dates (M-03 5.2); the other tabs don't use them
  const [closedBy, setClosedBy] = useState<Pick<UnitQuery, "type" | "closedFrom" | "closedTo">>({});
  const query: UnitQuery = { ...f, ...(tab === "closed" ? { view: "closed", ...closedBy } : tab !== "all" ? { type: tab } : {}) };
  const units = useUnits(query, page, PAGE);
  const tabs = useUnitTabs(f).data;
  // 2.37 · the tiles are the Inventory Manager's; everyone else opens straight on the sheet (demo render())
  const tiles = seesInventoryTiles(me.me?.roles ?? []);
  const s = useUnitSummary(tiles).data;
  const options = useUnitOptions().data;
  const unit = useUnit(open);
  const areaTabs = useAreaTabs(query).data ?? [];
  const archive = (id: string, code: string) => {
    if (!window.confirm(t("list.archiveConfirm", { code }))) return;
    void run(async () => {
      await api.del(`/inventory/units/${id}`);
      setOpen(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["area-tabs"] })]);
    }, t("list.archived", { code }));
  };
  const filter = (next: UnitQuery) => { setF(next); setPage(1); };
  const on = (k: keyof UnitQuery) => (e: { target: { value: string } }) => filter({ ...f, [k]: e.target.value });
  const toggle = (k: "stale" | "divisible" | "missing") => (e: { target: { checked: boolean } }) => filter({ ...f, [k]: e.target.checked ? "true" : undefined });
  const failed = units.error?.message;
  const list = failed ? [] : units.data?.items ?? [];
  const total = failed ? 0 : units.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // M-09 field permissions: hidden fields have no column and no filter (the API drops such filters too)
  const fields = useFields("inventory");
  const cols = columnsFor(tab === "all" ? "all" : tab, insider, t, fields.hidden);
  const onClosed = (k: keyof typeof closedBy) => (e: { target: { value: string } }) => { setClosedBy({ ...closedBy, [k]: e.target.value || undefined }); setPage(1); };
  // Primary isn't confirmed by the client as a sheet yet: its tab shows once there are Primary units
  const types: [TypeTab, string, number | undefined][] = [
    ["all", t("list.all"), tabs?.all], ["Rent", "Rent", tabs?.Rent], ["Resale", "Resale", tabs?.Resale], ["Income", "Income", tabs?.Income],
    ...(tabs?.Primary || tab === "Primary" ? [["Primary", "Primary", tabs?.Primary] as [TypeTab, string, number | undefined]] : []),
    ["closed", "Rented / Sold", tabs?.closed],
  ];

  return (
    <>
      {tiles && <div className="kpis">
        <KpiTile label={t("list.available")} value={s ? num(s.available) : "…"} sub="Rent · Resale · Income" icon="building" />
        <KpiTile label={t("chips.pdfDraft")} value={s ? num(s.pdfDraft) : "…"} sub={t("list.pdfDraftSub")} icon="file" tone="warn" />
        <KpiTile label={t("chips.stale")} value={s ? num(s.stale) : "…"} sub={t("list.staleSub")} icon="clock" tone="bad" onClick={() => filter({ ...f, stale: "true" })} />
        <KpiTile label={t("list.missing")} value={s ? num(s.missing) : "…"} sub={t("list.missingSub")} icon="alert" tone="bad" onClick={() => filter({ ...f, missing: "true" })} />
      </div>}
      <div className="row">
        <Tabs value={tab} onChange={(x) => { setTab(x); setPage(1); }} items={types} />
        <span className="spacer" />
        {me.can("inventory", "import") && <OldDataImport kind="units" />}{/* 13.1 · demo «استيراد Excel» */}
        {me.can("inventory", "approve") && <button className="btn ghost" onClick={() => setReport(true)}><Icon name="file" />{t("list.dailyReport")}</button>}
        {me.can("inventory", "approve") && <button className="btn ghost" onClick={() => setTeamTask(true)}><Icon name="check" />{t("list.teamTask")}</button>}
        {prepares && <button className="btn ghost" onClick={() => setLists(true)}><Icon name="list" />{t("list.listRequests")}</button>}
        {/* 2.28: the sheet as filtered now, every page (the API drops what the reader may not see) */}
        <ExportButton module="inventory" path="/inventory/units/export" query={toParams(query, 1, PAGE)} filename={t("list.exportFile")} label={t("list.export")} />
        {me.can("inventory", "create") && <button className="btn" onClick={() => setForm("new")}><Icon name="plus" />{t("list.newUnit")}</button>}
      </div>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={insider ? t("list.searchInsider") : t("list.search")} value={f.q ?? ""} onChange={on("q")} aria-label={t("list.searchLabel")} /></label>
        {fields.shows("area") && <select value={f.area ?? ""} onChange={on("area")} aria-label="Area">
          <option value="">{t("list.allAreas")}</option>{options?.areas.map(({ value }) => <option key={value} value={value}>{serverText(value)}</option>)}
        </select>}
        {fields.shows("condition") && <select value={f.condition ?? ""} onChange={on("condition")} aria-label="Condition">
          <option value="">{t("list.allConditions")}</option>{options?.conditions.map(({ value }) => <option key={value} value={value}>{serverText(value)}</option>)}
        </select>}
        {fields.shows("agent") && <select value={f.agentId ?? ""} onChange={on("agentId")} aria-label="Agent">
          <option value="">{t("list.allAgents")}</option>{options?.agents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>}
        {tab === "closed" && <>
          <select value={closedBy.type ?? ""} onChange={onClosed("type")} aria-label={t("list.closedAs")}>
            <option value="">{t("list.allClosedTypes")}</option>{(["Rent", "Resale", "Income"] as const).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <label className="date-f"><span>{t("list.from")}</span><input type="date" value={closedBy.closedFrom ?? ""} max={closedBy.closedTo} onChange={onClosed("closedFrom")} aria-label={t("list.closedFrom")} /></label>
          <label className="date-f"><span>{t("list.to")}</span><input type="date" value={closedBy.closedTo ?? ""} min={closedBy.closedFrom} onChange={onClosed("closedTo")} aria-label={t("list.closedTo")} /></label>
        </>}
        {fields.shows("stale") && <label className="tog"><input type="checkbox" checked={!!f.stale} onChange={toggle("stale")} /><span>{t("chips.stale")}</span></label>}
        {fields.shows("divisible") && <label className="tog"><input type="checkbox" checked={!!f.divisible} onChange={toggle("divisible")} /><span>{t("list.divisible")}</span></label>}
        <label className="tog"><input type="checkbox" checked={!!f.missing} onChange={toggle("missing")} /><span>{t("list.missing")}</span></label>
        <span className="spacer" />
        <div className="seg" role="group" aria-label={t("list.view")}>
          <button aria-pressed={mode === "table"} title={t("list.sheet")} onClick={() => setMode("table")}><Icon name="list" /><span>{t("list.sheet")}</span></button>
          <button aria-pressed={mode === "drive"} title={t("list.folders")} onClick={() => setMode("drive")}><Icon name="board" /><span>{t("list.folders")}</span></button>
        </div>
      </div>
      <div className="row"><span className="hint num">{t("list.count", { count: total })}</span></div>
      {failed ? <Note kind="warn">{failed}</Note> : mode === "drive"
        ? (list.length
          ? <div className="drive">{list.map((u) => (
            <article key={u.id} className="ucard" role="button" tabIndex={0} onClick={() => setOpen(u.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(u.id)}>
              <div className={`u-img u-${u.type}`}>{u.photo ? <img src={u.photo} alt="" loading="lazy" /> : <Icon name="image" />}<span className="mono">{u.code}</span>{u.pdfStatus === "draft" && <Chip tone="warn">PDF draft</Chip>}</div>
              <div className="u-body">
                <b>{u.project}</b>
                <small>{serverText(u.area)} · {t("list.floor", { floor: String(u.floor || "—") })}</small>
                <div className="row"><span className="num u-space">{t("list.meters", { space: num(u.space) })}</span><span className="spacer" /><b className="num">{short(u.totalPrice)}</b></div>
                <div className="row"><Chip tone={TYPE_TONE[u.type]}>{u.type}</Chip>{u.divisible && <Chip tone="info">{t("chips.divisible")}</Chip>}{u.stale && <Chip tone="bad">{t("list.update")}</Chip>}</div>
              </div>
            </article>
          ))}</div>
          : <Empty text={t("list.empty")} />)
        : <Table className="has-sheets" head={cols.map(([, l]) => l)} rows={list.map((u) => cols.map(([k]) => cell(u, k, t)))} empty={t("list.empty")} onRow={(i) => setOpen(list[i]!.id)}
          pick={{ ids: list.map((u) => u.id), picked, onChange: setPicked, all: t("listOfOptions.pickAll"), one: (i) => t("listOfOptions.pickOne", { code: list[i]!.code }) }} />}
      {picked.length > 0 && <ListOfOptionsBar ids={picked} onClear={() => setPicked([])} />}
      {fields.shows("space") && <AreaTabsBar tabs={areaTabs} value={f.tabId} onChange={(tabId) => filter({ ...f, tabId })} editable={me.can("inventory", "edit")} />}
      {!failed && pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("common.next")}</button>
        </div>
      )}
      <p className="hint">{t("list.hint")}</p>
      {open && <UnitDrawer ids={list.map((u) => u.id)} id={open} insider={insider} canConfirm={me.can("inventory", "approve")} unit={unit.data} error={unit.error} onGo={setOpen} onClose={() => setOpen(null)}
        {...(me.can("inventory", "edit") ? { onComplete: () => setForm("edit") } : {})}
        actions={unit.data && (me.can("inventory", "edit") || me.can("inventory", "delete")) && (
          <div className="row">
            {me.can("inventory", "edit") && <button className="btn ghost" onClick={() => setForm("edit")}>{t("list.edit")}</button>}
            {me.can("inventory", "delete") && <button className="btn ghost" onClick={() => archive(unit.data!.id, unit.data!.code)}><Icon name="x" />{t("list.archive")}</button>}
            {me.can("inventory", "edit") && fields.edits("lastOwnerUpdateAt") && <OwnerUpdateButton u={unit.data} />}
          </div>
        )} />}
      {form && <UnitForm unit={form === "edit" ? unit.data : undefined} options={options} tabs={areaTabs} onClose={() => setForm(null)}
        onSaved={(id) => { setForm(null); setOpen(id); }} />}
      {report && <DailyReportModal onClose={() => setReport(false)} />}
      {lists && <ListRequestsModal onClose={() => setLists(false)} />}
      {teamTask && <TeamTaskModal units={list} onClose={() => setTeamTask(false)} />}
      {me.can("inventory", "create") && !picked.length && <Fab onClick={() => setForm("new")} label={t("list.newUnit")} />}
    </>
  );
}
