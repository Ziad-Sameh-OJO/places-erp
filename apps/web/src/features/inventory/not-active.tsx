"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { NOT_ACTIVE_STATUSES, type NotActiveStatus } from "@places/domain";
import type { CreatedUnit, NotActiveCounts, NotActivePerson, NotActiveRowView, NotActiveSheetView, NotActiveTab, Paged, UnitOptions } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Chip, Empty, Field, Icon, Modal, Note, Table, Tabs, useAction } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { UploadSheet } from "./not-active-upload";
import { UnitForm } from "./unit-form";

const PAGE = 100;
const TONE: Record<NotActiveStatus, "warn" | "bad" | "ok"> = { "No Answer": "warn", "Not True": "bad", Done: "ok" };

/**
 * M-03 · Not Active Inventory (demo notactive.js): the sheets Manar uploads (2.14), their tabs, the numbers already in
 * the inventory for her to decide, the rows she sends to Marwa, and Marwa's classification — No Answer, Not True with
 * its reason, Done with the new unit's form (2.15). A sheet's columns are its own until the client sends the CFC sheet's.
 */
export function NotActivePage() {
  const t = useTranslations("inventory");
  const { can } = useMe();
  const sheets = useQuery({ queryKey: ["not-active", "sheets"], queryFn: () => api.get<NotActiveSheetView[]>("/not-active/sheets") });
  const [picked, setPicked] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const all = sheets.data ?? [];
  const sheet = all.find((s) => s.id === picked) ?? all[0];
  const manager = can("notactive", "approve");
  return (
    <>
      {manager
        ? <Note>{t("notActive.managerNote")}</Note>
        : <Note>{t("notActive.teamNote")}</Note>}
      <div className="row">
        {all.length > 0 && <div className="seg" role="group" aria-label={t("notActive.sheet")}>
          {all.map((s) => <button key={s.id} aria-pressed={s.id === sheet?.id} onClick={() => setPicked(s.id)}><Icon name="layers" /><span>{s.name}</span></button>)}
        </div>}
        <span className="spacer" />
        {can("notactive", "import") && <button className="btn ghost" onClick={() => setUploading(true)}><Icon name="upload" />{t("notActive.upload")}</button>}
      </div>
      {sheets.error ? <Note kind="warn">{sheets.error.message}</Note>
        : !sheets.data ? <p className="hint">{t("common.loading")}</p>
        : sheet ? <SheetView key={sheet.id} sheet={sheet} manager={manager} />
        : <Empty text={t("notActive.noSheets")} icon="layers" />}
      <p className="hint">{t("notActive.columnsHint")}</p>
      {uploading && <UploadSheet sheets={all} onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); setPicked(id); }} />}
    </>
  );
}

function SheetView({ sheet, manager }: { sheet: NotActiveSheetView; manager: boolean }) {
  const t = useTranslations("inventory");
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const [tab, setTab] = useState<NotActiveTab>("all");
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState<string[]>([]);
  const [notTrue, setNotTrue] = useState<NotActiveRowView | null>(null);
  const [done, setDone] = useState<NotActiveRowView | null>(null);
  const counts = useQuery({ queryKey: ["not-active", "counts", sheet.id], queryFn: () => api.get<NotActiveCounts>(`/not-active/sheets/${sheet.id}/counts`) });
  const rows = useQuery({
    queryKey: ["not-active", "rows", sheet.id, tab, page],
    queryFn: () => api.get<Paged<NotActiveRowView>>(`/not-active/sheets/${sheet.id}/rows?page=${page}&pageSize=${PAGE}&tab=${encodeURIComponent(tab)}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["not-active"] });
  const classify = (r: NotActiveRowView, status: NotActiveStatus, feedback?: string) =>
    run(async () => { await api.put(`/not-active/rows/${r.id}/status`, { status, ...(feedback ? { feedback } : {}) }); await refresh(); },
      status === "Not True" ? t("notActive.savedNotTrue") : r.matched && !r.matchSeen ? t("notActive.savedMatched") : t("notActive.saved", { status }));
  const c = counts.data;
  const list = rows.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((rows.data?.total ?? 0) / PAGE));
  const edit = can("notactive", "edit");
  // the headers are the table's keys, so the pick column has a name of its own
  const head = [...(manager ? [t("notActive.pick")] : []), ...sheet.columns, t("notActive.status"), "Feedback", t("notActive.with"), ""];
  return (
    <>
      <div className="kpis">
        <KpiTile label={t("notActive.all")} value={c ? num(c.all) : "…"} sub={sheet.name} icon="layers" />
        <KpiTile label={t("notActive.pending")} value={c ? num(c.pending) : "…"} sub={manager ? t("notActive.pendingManager") : t("notActive.pendingMine")} icon="clock" tone="warn" />
        <KpiTile label="Done" value={c ? num(c.Done) : "…"} sub={t("notActive.newUnits")} icon="check" tone="ok" />
        <KpiTile label={t("notActive.matched")} value={c ? num(c.matched) : "…"} sub={t("notActive.matchedSub")} icon="alert" tone="bad" />
      </div>
      <div className="row">
        <Tabs value={tab} onChange={(x) => { setTab(x); setPage(1); setPick([]); }}
          items={[["all", "All Sheet", c?.all], ...NOT_ACTIVE_STATUSES.map((s) => [s, s, c?.[s]] as [NotActiveTab, string, number | undefined])]} />
        <span className="spacer" />
        <span className="hint">{t("notActive.dedupe", { column: sheet.dedupeBy })}{sheet.numberBy ? ` · ${t("notActive.compare", { column: sheet.numberBy })}` : ""}</span>
      </div>
      {manager && pick.length > 0 && <AssignBar sheetId={sheet.id} rowIds={pick} onDone={() => { setPick([]); void refresh(); }} />}
      {rows.error ? <Note kind="warn">{rows.error.message}</Note> : (
        <Table head={head} empty={rows.data ? t("notActive.noRows") : t("common.loading")} rows={list.map((r) => [
          ...(manager ? [<input key="p" type="checkbox" aria-label={t("notActive.pickOne")} disabled={r.status === "Done"} checked={pick.includes(r.id)}
            onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} />] : []),
          ...sheet.columns.map((col) => r.data[col] ?? "—"),
          <StatusCell key="s" r={r} />,
          r.feedback ?? "",
          r.assignedTo?.name ?? "—",
          <Actions key="a" r={r} manager={manager} edit={edit} onSet={(s) => (s === "Not True" ? setNotTrue(r) : s === "Done" && !(manager && r.matched) ? setDone(r) : void classify(r, s))} />,
        ])} />
      )}
      {pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("common.next")}</button>
        </div>
      )}
      {notTrue && <NotTrueDialog onClose={() => setNotTrue(null)} onSave={(fb) => { const r = notTrue; setNotTrue(null); void classify(r, "Not True", fb); }} />}
      {done && <DoneForm sheet={sheet} row={done} onClose={() => setDone(null)} onSaved={() => { setDone(null); void refresh(); }} />}
    </>
  );
}

function StatusCell({ r }: { r: NotActiveRowView }) {
  const t = useTranslations("inventory.notActive");
  return (
    <>
      {r.status ? <Chip tone={TONE[r.status as NotActiveStatus] ?? ""}>{r.status}</Chip> : <Chip>{t("notYet")}</Chip>}
      {r.matched && <span className="sub"><Chip tone="bad">{t("matchedCode", { code: r.matched.code })}</Chip></span>}
      {r.unit && <span className="sub mono">{r.unit.code}</span>}
    </>
  );
}

/** Manar decides a number already in the inventory; the person a row was sent to (or Manar) classifies it. Done rows are closed. */
function Actions({ r, manager, edit, onSet }: { r: NotActiveRowView; manager: boolean; edit: boolean; onSet: (s: NotActiveStatus) => void }) {
  const t = useTranslations("inventory.notActive");
  if (r.status === "Done" || !edit) return null;
  if (manager && r.matched && !r.matchSeen) {
    return (
      <select aria-label={t("numberStatus")} value="" onChange={(e) => e.target.value && onSet(e.target.value as NotActiveStatus)}>
        <option value="">{t("pickStatus")}</option>{NOT_ACTIVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  return (
    <div className="row">
      {NOT_ACTIVE_STATUSES.map((s) => <button key={s} className={`btn ${s === "Done" ? "" : "ghost"} sm`} onClick={() => onSet(s)}>{s}</button>)}
    </div>
  );
}

/** «ابعتهم Task لمروة»: the picked rows to someone on the inventory team. */
function AssignBar({ sheetId, rowIds, onDone }: { sheetId: string; rowIds: string[]; onDone: () => void }) {
  const t = useTranslations("inventory.notActive");
  const run = useAction();
  const people = useQuery({ queryKey: ["not-active", "assignees"], queryFn: () => api.get<NotActivePerson[]>("/not-active/assignees") }).data ?? [];
  const [to, setTo] = useState("");
  const target = to || people[0]?.id || "";
  const name = people.find((p) => p.id === target)?.name ?? "";
  return (
    <div className="note"><Icon name="send" />
      <span className="spacer">{t("picked", { count: num(rowIds.length) })}</span>
      <select value={target} onChange={(e) => setTo(e.target.value)} aria-label={t("sendTo")}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="btn sm" disabled={!target} onClick={() => void run(async () => { await api.post(`/not-active/sheets/${sheetId}/assign`, { rowIds, to: target }); onDone(); }, t("sent", { count: num(rowIds.length), name }))}>{t("sendTask")}</button>
    </div>
  );
}

/** M-03 2.3: Not True isn't saved without the reason. */
function NotTrueDialog({ onClose, onSave }: { onClose: () => void; onSave: (feedback: string) => void }) {
  const t = useTranslations("inventory.notActive");
  const [fb, setFb] = useState("");
  return (
    <Modal title={t("notTrueTitle")} onClose={onClose}>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); if (fb.trim()) onSave(fb.trim()); }}>
        <Field label={t("reason")} req wide><textarea required maxLength={500} value={fb} onChange={(e) => setFb(e.target.value)} placeholder={t("reasonExample")} /></Field>
        <div className="row end wide"><button className="btn" disabled={!fb.trim()}>{t("save")}</button></div>
      </form>
    </Modal>
  );
}

/** Done = a new unit from this number: the main inventory's unit form, the owner's number from the sheet (M-03 1.1). */
function DoneForm({ sheet, row, onClose, onSaved }: { sheet: NotActiveSheetView; row: NotActiveRowView; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("inventory.notActive");
  const options = useQuery({ queryKey: ["not-active", "unit-options"], queryFn: () => api.get<UnitOptions>("/not-active/unit-options"), staleTime: 60_000 });
  return (
    <UnitForm options={options.data} tabs={[]} onClose={onClose} onSaved={onSaved}
      fromSheet={{
        title: t("doneTitle", { name: sheet.name }),
        ownerPhone: sheet.numberBy ? row.data[sheet.numberBy] ?? "" : "",
        save: (body) => api.post<CreatedUnit>(`/not-active/rows/${row.id}/done`, body),
      }} />
  );
}
