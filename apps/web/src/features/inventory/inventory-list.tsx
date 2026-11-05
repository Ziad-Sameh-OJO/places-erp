"use client";
import { useEffect, useState } from "react";
import { keepsInventory } from "@places/domain";
import { Fab, KpiTile } from "@/components/blocks";
import { Chip, Empty, Icon, Note, Table, Tabs, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/me";
import { num, short } from "@/lib/format";
import { TYPE_TONE, cell, columnsFor } from "./unit-bits";
import { UnitDrawer } from "./unit-drawer";
import { UnitForm } from "./unit-form";
import { OldDataImport } from "../imports/old-data-import";
import { AreaTabsBar } from "./area-tabs";
import { TeamTaskModal } from "./team-tasks";
import { DailyReportModal } from "./daily-report";
import { type UnitQuery, useAreaTabs, useUnit, useUnitOptions, useUnitSummary, useUnitTabs, useUnits } from "./use-units";

const PAGE = 50;
type TypeTab = "all" | "Rent" | "Resale" | "Income" | "Primary" | "closed";

/**
 * M-03 · مخزون الوحدات (demo inventory.js): the tiles, Rent · Resale · Income in one list with a type tab, the
 * filters, the sheet or the folders (cards), and a unit's drawer. Sales see confirmed units only (Q15, the API).
 */
export function InventoryList() {
  const me = useMe();
  const insider = keepsInventory({ can: me.can });
  const [tab, setTab] = useState<TypeTab>("all");
  const [f, setF] = useState<UnitQuery>({});
  const [mode, setMode] = useState<"table" | "drive">("table");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  // a notification links to one unit (the close to confirm, Q16)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("unit")) setOpen(q.get("unit"));
    if (q.get("report")) setReport(true); // «التقرير اليومي جاهز» (2.18)
    if (q.get("missing")) setF({ missing: "true" }); // «مهامي النهارده»: «N وحدة تانية ناقصها بيانات» (2.20)
  }, []);
  const [form, setForm] = useState<"new" | "edit" | null>(null);
  const [teamTask, setTeamTask] = useState(false);
  const [report, setReport] = useState(false);
  const qc = useQueryClient();
  const run = useAction();
  // the rented / sold sheet keeps its own type and dates (M-03 5.2); the other tabs don't use them
  const [closedBy, setClosedBy] = useState<Pick<UnitQuery, "type" | "closedFrom" | "closedTo">>({});
  const query: UnitQuery = { ...f, ...(tab === "closed" ? { view: "closed", ...closedBy } : tab !== "all" ? { type: tab } : {}) };
  const units = useUnits(query, page, PAGE);
  const tabs = useUnitTabs(f).data;
  const s = useUnitSummary().data;
  const options = useUnitOptions().data;
  const unit = useUnit(open);
  const areaTabs = useAreaTabs(query).data ?? [];
  const archive = (id: string, code: string) => {
    if (!window.confirm(`أرشفة ${code}؟ هتختفي من الانفنتوري.`)) return;
    void run(async () => {
      await api.del(`/inventory/units/${id}`);
      setOpen(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["area-tabs"] })]);
    }, `${code} اتأرشفت`);
  };
  const filter = (next: UnitQuery) => { setF(next); setPage(1); };
  const on = (k: keyof UnitQuery) => (e: { target: { value: string } }) => filter({ ...f, [k]: e.target.value });
  const toggle = (k: "stale" | "divisible" | "missing") => (e: { target: { checked: boolean } }) => filter({ ...f, [k]: e.target.checked ? "true" : undefined });
  const failed = units.error?.message;
  const list = failed ? [] : units.data?.items ?? [];
  const total = failed ? 0 : units.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cols = columnsFor(tab === "all" ? "all" : tab, insider);
  const onClosed = (k: keyof typeof closedBy) => (e: { target: { value: string } }) => { setClosedBy({ ...closedBy, [k]: e.target.value || undefined }); setPage(1); };
  // Primary isn't confirmed by the client as a sheet yet: its tab shows once there are Primary units
  const types: [TypeTab, string, number | undefined][] = [
    ["all", "الكل", tabs?.all], ["Rent", "Rent", tabs?.Rent], ["Resale", "Resale", tabs?.Resale], ["Income", "Income", tabs?.Income],
    ...(tabs?.Primary || tab === "Primary" ? [["Primary", "Primary", tabs?.Primary] as [TypeTab, string, number | undefined]] : []),
    ["closed", "Rented / Sold", tabs?.closed],
  ];

  return (
    <>
      <div className="kpis">
        <KpiTile label="وحدات متاحة" value={s ? num(s.available) : "…"} sub="Rent · Resale · Income" icon="building" />
        {insider && <KpiTile label="PDF مستني Confirm" value={s ? num(s.pdfDraft) : "…"} sub="قبل ما يتنشر للسيلز" icon="file" tone="warn" />}
        <KpiTile label="محتاجة ابديت" value={s ? num(s.stale) : "…"} sub="last update أكتر من شهر" icon="clock" tone="bad" onClick={() => filter({ ...f, stale: "true" })} />
        <KpiTile label="تنفع تتقسم" value={s ? num(s.divisible) : "…"} sub="مساحات كبيرة" icon="layers" tone="ok" />
        <KpiTile label="ناقصها بيانات" value={s ? num(s.missing) : "…"} sub="تتكمّل بعدين" icon="alert" tone="bad" onClick={() => filter({ ...f, missing: "true" })} />
      </div>
      <div className="row">
        <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} items={types} />
        <span className="spacer" />
        {me.can("inventory", "import") && <OldDataImport kind="units" />}{/* 13.1 · demo «استيراد Excel» */}
        {me.can("inventory", "approve") && <button className="btn ghost" onClick={() => setReport(true)}><Icon name="file" />التقرير اليومي</button>}
        {me.can("inventory", "approve") && <button className="btn ghost" onClick={() => setTeamTask(true)}><Icon name="check" />مهمة للفريق</button>}
        {me.can("inventory", "create") && <button className="btn" onClick={() => setForm("new")}><Icon name="plus" />وحدة جديدة</button>}
      </div>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={insider ? "دوّر بأي حاجة: مشروع، كود، مالك، رقم" : "دوّر بأي حاجة: مشروع، كود، مبنى"} value={f.q ?? ""} onChange={on("q")} aria-label="بحث في الوحدات" /></label>
        <select value={f.area ?? ""} onChange={on("area")} aria-label="Area">
          <option value="">كل المناطق</option>{options?.areas.map(({ value }) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={f.condition ?? ""} onChange={on("condition")} aria-label="Condition">
          <option value="">كل التشطيبات</option>{options?.conditions.map(({ value }) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={f.agentId ?? ""} onChange={on("agentId")} aria-label="Agent">
          <option value="">كل الـ agents</option>{options?.agents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {tab === "closed" && <>
          <select value={closedBy.type ?? ""} onChange={onClosed("type")} aria-label="اتقفلت كـ">
            <option value="">Rent و Resale و Income</option>{(["Rent", "Resale", "Income"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="date-f"><span>من</span><input type="date" value={closedBy.closedFrom ?? ""} max={closedBy.closedTo} onChange={onClosed("closedFrom")} aria-label="اتقفلت من" /></label>
          <label className="date-f"><span>لحد</span><input type="date" value={closedBy.closedTo ?? ""} min={closedBy.closedFrom} onChange={onClosed("closedTo")} aria-label="اتقفلت لحد" /></label>
        </>}
        <label className="tog"><input type="checkbox" checked={!!f.stale} onChange={toggle("stale")} /><span>محتاجة ابديت</span></label>
        <label className="tog"><input type="checkbox" checked={!!f.divisible} onChange={toggle("divisible")} /><span>تنفع تتقسم</span></label>
        <label className="tog"><input type="checkbox" checked={!!f.missing} onChange={toggle("missing")} /><span>ناقصها بيانات</span></label>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="طريقة العرض">
          <button aria-pressed={mode === "table"} title="شيت" onClick={() => setMode("table")}><Icon name="list" /><span>شيت</span></button>
          <button aria-pressed={mode === "drive"} title="فولدرات" onClick={() => setMode("drive")}><Icon name="board" /><span>فولدرات</span></button>
        </div>
      </div>
      <div className="row"><span className="hint num">{num(total)} وحدة</span></div>
      {failed ? <Note kind="warn">{failed}</Note> : mode === "drive"
        ? (list.length
          ? <div className="drive">{list.map((u) => (
            <article key={u.id} className="ucard" role="button" tabIndex={0} onClick={() => setOpen(u.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(u.id)}>
              <div className={`u-img u-${u.type}`}>{u.photo ? <img src={u.photo} alt="" loading="lazy" /> : <Icon name="image" />}<span className="mono">{u.code}</span>{u.pdfStatus === "draft" && <Chip tone="warn">PDF draft</Chip>}</div>
              <div className="u-body">
                <b>{u.project}</b>
                <small>{u.area} · الدور {u.floor || "—"}</small>
                <div className="row"><span className="num u-space">{num(u.space)} م</span><span className="spacer" /><b className="num">{short(u.totalPrice)}</b></div>
                <div className="row"><Chip tone={TYPE_TONE[u.type]}>{u.type}</Chip>{u.divisible && <Chip tone="info">تتقسم</Chip>}{u.stale && <Chip tone="bad">ابديت</Chip>}</div>
              </div>
            </article>
          ))}</div>
          : <Empty text="مفيش وحدات في الفلتر ده" />)
        : <Table className="has-sheets" head={cols.map(([, l]) => l)} rows={list.map((u) => cols.map(([k]) => cell(u, k)))} empty="مفيش وحدات في الفلتر ده" onRow={(i) => setOpen(list[i]!.id)} />}
      <AreaTabsBar tabs={areaTabs} value={f.tabId} onChange={(tabId) => filter({ ...f, tabId })} editable={me.can("inventory", "edit")} />
      {!failed && pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      <p className="hint">التابات اللي تحت Customized: الفريق بيحدد الشرايح ويضيف أو يشيل. والوحدة اللي الـ last update بتاعها عدّى عليه أكتر من شهر بتظهر متأخرة، وبتتحسب في الـ activity بتاعة منار ورندا.</p>
      {open && <UnitDrawer ids={list.map((u) => u.id)} id={open} insider={insider} canConfirm={me.can("inventory", "approve")} unit={unit.data} error={unit.error} onGo={setOpen} onClose={() => setOpen(null)}
        {...(me.can("inventory", "edit") ? { onComplete: () => setForm("edit") } : {})}
        actions={unit.data && (me.can("inventory", "edit") || me.can("inventory", "delete")) && (
          <div className="row">
            {me.can("inventory", "edit") && <button className="btn ghost" onClick={() => setForm("edit")}>تعديل البيانات</button>}
            {me.can("inventory", "delete") && <button className="btn ghost" onClick={() => archive(unit.data!.id, unit.data!.code)}><Icon name="x" />أرشفة</button>}
          </div>
        )} />}
      {form && <UnitForm unit={form === "edit" ? unit.data : undefined} options={options} tabs={areaTabs} onClose={() => setForm(null)}
        onSaved={(id) => { setForm(null); setOpen(id); }} />}
      {report && <DailyReportModal onClose={() => setReport(false)} />}
      {teamTask && <TeamTaskModal units={list} onClose={() => setTeamTask(false)} />}
      {me.can("inventory", "create") && <Fab onClick={() => setForm("new")} label="وحدة جديدة" />}
    </>
  );
}
