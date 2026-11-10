"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { NOT_ACTIVE_STATUSES, type NotActiveStatus } from "@places/domain";
import type { CreatedUnit, NotActiveCounts, NotActivePerson, NotActiveRowView, NotActiveSheetView, NotActiveTab, Paged, UnitOptions } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Chip, Empty, Field, Icon, Modal, Note, Table, Tabs, useAction } from "@/components/ui";
import { useFields, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { day, num } from "@/lib/format";
import { DedupeChooser, UploadSheet } from "./not-active-upload";
import { UnitForm } from "./unit-form";

const PAGE = 100;
const TONE: Record<NotActiveStatus, "warn" | "bad" | "ok"> = { "No Answer": "warn", "Not True": "bad", Done: "ok" };

/**
 * M-03 · Not Active Inventory (demo notactive.js): 2.39 · the files (one per sheet) grouped in folders, each named when
 * it's made; inside a file its sheet (2.14), the numbers already in the inventory for Manar to decide, the rows she
 * sends to Marwa, and Marwa's classification — No Answer, Not True with its reason, Done with the new unit's form
 * (2.15). Marwa only gets the files with rows sent to her (the API decides). A sheet's columns are its own.
 */
export function NotActivePage() {
  const t = useTranslations("inventory");
  const { can } = useMe();
  const sheets = useQuery({ queryKey: ["not-active", "sheets"], queryFn: () => api.get<NotActiveSheetView[]>("/not-active/sheets") });
  const [openId, setOpenId] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [first, setFirst] = useState<File | null>(null); // the sheet picked in «ملف جديد», uploaded right into it
  const all = sheets.data ?? [];
  const open = all.find((s) => s.id === openId);
  const manager = can("notactive", "approve");
  // the demo's canFile: whoever manages the inventory makes files and uploads sheets into them (the API checks it again)
  const canFile = can("notactive", "import") || can("inventory", "edit");
  if (sheets.error) return <Note kind="warn">{sheets.error.message}</Note>;
  if (!sheets.data) return <p className="hint">{t("common.loading")}</p>;
  return (
    <>
      {open ? <FileView key={open.id} sheet={open} sheets={all} manager={manager} canFile={canFile} first={first} onBack={() => setOpenId(null)} onUploaded={() => setFirst(null)} />
        : <FilesView files={all} manager={manager} canFile={canFile} onOpen={setOpenId} onNew={() => setMaking(true)} />}
      {making && <FileForm onClose={() => setMaking(false)} onSaved={(f, sheet) => { setMaking(false); setFirst(sheet); setOpenId(f.id); }} />}
    </>
  );
}

/** Level 1: the files, grouped by folder (no folder last), with a search by the file's or the folder's name. */
function FilesView({ files, manager, canFile, onOpen, onNew }: { files: NotActiveSheetView[]; manager: boolean; canFile: boolean; onOpen: (id: string) => void; onNew: () => void }) {
  const t = useTranslations("inventory.notActive");
  const [q, setQ] = useState("");
  const shown = files.filter((f) => !q.trim() || `${f.name} ${f.folder ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const folders = [...new Set(shown.map((f) => f.folder ?? ""))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b, "ar")));
  return (
    <>
      <Note>{manager || canFile ? t("files.note") : t("files.mineNote")}</Note>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("files.search")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <span className="spacer" />
        {canFile && <button className="btn" onClick={onNew}><Icon name="plus" />{t("files.new")}</button>}
      </div>
      {shown.length ? folders.map((folder) => {
        const inIt = shown.filter((f) => (f.folder ?? "") === folder);
        return <section key={folder || "-"} className="na-folder">
          <h3 className="na-folder-h"><Icon name="folder" />{folder || t("files.noFolder")} <span className="tab-n">{inIt.length}</span></h3>
          <div className="drive">{inIt.map((f) => <FileCard key={f.id} f={f} onOpen={() => onOpen(f.id)} />)}</div>
        </section>;
      }) : <Empty text={q.trim() ? t("files.noMatch") : t("files.none")} icon="layers" />}
    </>
  );
}

function FileCard({ f, onOpen }: { f: NotActiveSheetView; onOpen: () => void }) {
  const t = useTranslations("inventory.notActive");
  return (
    <article className="ucard" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="u-img na-file"><Icon name="layers" /><span className="mono">{t("files.rows", { count: num(f.rows) })}</span></div>
      <div className="u-body">
        <b>{f.name}</b>
        <small>{t("files.made", { day: day(f.createdAt) })}{f.createdBy ? ` · ${f.createdBy}` : ""}</small>
        <div className="row">
          {f.rows ? <Chip tone={f.pending ? "warn" : "ok"}>{f.pending ? t("files.waiting", { count: num(f.pending) }) : t("files.allDone")}</Chip> : <Chip>{t("files.empty")}</Chip>}
          {f.matched > 0 && <Chip tone="bad">{t("matched")}</Chip>}
        </div>
      </div>
    </article>
  );
}

/** Level 2: one file — where it is, rename / move it, upload its sheet into it, then the sheet itself. */
function FileView({ sheet, sheets, manager, canFile, first, onBack, onUploaded }: {
  sheet: NotActiveSheetView; sheets: NotActiveSheetView[]; manager: boolean; canFile: boolean; first: File | null; onBack: () => void; onUploaded: () => void;
}) {
  const t = useTranslations("inventory.notActive");
  const [renaming, setRenaming] = useState(false);
  const [uploading, setUploading] = useState(!!first);
  return (
    <>
      <nav className="na-crumb">
        <button className="lnk" onClick={onBack}><Icon name="folder" />{t("files.all")}</button><span>‹</span>
        {sheet.folder && <><span>{sheet.folder}</span><span>‹</span></>}
        <b>{sheet.name}</b>
        {canFile && <button className="btn ghost sm" onClick={() => setRenaming(true)}>{t("files.rename")}</button>}
      </nav>
      <Note>{manager || canFile ? t("files.inNote") : t("teamNote")}</Note>
      {canFile && <div className="row"><button className="btn" onClick={() => setUploading(true)}><Icon name="upload" />{sheet.rows ? t("files.uploadMore") : t("files.upload")}</button></div>}
      {sheet.rows ? <SheetView sheet={sheet} manager={manager} canFile={canFile} />
        : <div className="ufolder empty"><Icon name="upload" /><b>{t("files.emptyTitle")}</b><span className="hint">{canFile ? t("files.emptyUp") : t("files.emptyView")}</span></div>}
      {renaming && <FileForm file={sheet} onClose={() => setRenaming(false)} onSaved={() => setRenaming(false)} />}
      {uploading && <UploadSheet sheets={sheets} file={sheet} initial={first} onClose={() => { setUploading(false); onUploaded(); }} onDone={() => { setUploading(false); onUploaded(); }} />}
    </>
  );
}

/** «ملف جديد» (name required and one of a kind, a folder to pick or a new one, the sheet now or later) and «تغيير الاسم / الفولدر». */
function FileForm({ file, onClose, onSaved }: { file?: NotActiveSheetView; onClose: () => void; onSaved: (f: NotActiveSheetView, sheet: File | null) => void }) {
  const t = useTranslations("inventory.notActive");
  const run = useAction();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["not-active", "folders"], queryFn: () => api.get<string[]>("/not-active/folders") }).data ?? [];
  const [name, setName] = useState(file?.name ?? "");
  const [folder, setFolder] = useState(file?.folder ?? "");
  const [sheet, setSheet] = useState<File | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body = { name: name.trim(), folder: folder.trim() };
      const f = file ? await api.put<NotActiveSheetView>(`/not-active/sheets/${file.id}`, body) : await api.post<NotActiveSheetView>("/not-active/sheets", body);
      await qc.invalidateQueries({ queryKey: ["not-active"] });
      onSaved(f, sheet);
    }, file ? t("files.saved") : sheet ? undefined : t("files.made2", { name: name.trim() }));
  };
  return (
    <Modal title={file ? t("files.renameTitle") : t("files.newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Field label={t("files.name")} req wide><input required maxLength={60} placeholder={t("files.nameExample")} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("files.folder")} wide>
          <input list="na-folders" maxLength={60} placeholder={t("files.folderHint")} value={folder} onChange={(e) => setFolder(e.target.value)} />
          <datalist id="na-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </Field>
        {!file && <Field label={t("files.sheet")} wide>
          <label className="btn ghost"><Icon name="upload" />{sheet ? sheet.name : t("files.pickSheet")}
            <input type="file" hidden accept=".xlsx,.csv" onChange={(e) => { setSheet(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </Field>}
        <div className="row end wide"><button className="btn" disabled={!name.trim()}>{file ? t("save") : <><Icon name="plus" />{t("files.make")}</>}</button></div>
      </form>
    </Modal>
  );
}

function SheetView({ sheet, manager, canFile }: { sheet: NotActiveSheetView; manager: boolean; canFile: boolean }) {
  const t = useTranslations("inventory");
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const [tab, setTab] = useState<NotActiveTab>("all");
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState<string[]>([]);
  const [notTrue, setNotTrue] = useState<NotActiveRowView | null>(null);
  const [done, setDone] = useState<NotActiveRowView | null>(null);
  const [dup, setDup] = useState<"" | "any" | "none">(""); // 2.40 · «التكرار»
  const [dedupe, setDedupe] = useState(false);
  const counts = useQuery({ queryKey: ["not-active", "counts", sheet.id], queryFn: () => api.get<NotActiveCounts>(`/not-active/sheets/${sheet.id}/counts`) });
  const rows = useQuery({
    queryKey: ["not-active", "rows", sheet.id, tab, page, dup],
    queryFn: () => api.get<Paged<NotActiveRowView>>(`/not-active/sheets/${sheet.id}/rows?page=${page}&pageSize=${PAGE}&tab=${encodeURIComponent(tab)}&dup=${dup}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["not-active"] });
  const classify = (r: NotActiveRowView, status: NotActiveStatus, feedback?: string) =>
    run(async () => { await api.put(`/not-active/rows/${r.id}/status`, { status, ...(feedback ? { feedback } : {}) }); await refresh(); },
      status === "Not True" ? t("notActive.savedNotTrue") : r.matched && !r.matchSeen ? t("notActive.savedMatched") : t("notActive.saved", { status }));
  const c = counts.data;
  const list = rows.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((rows.data?.total ?? 0) / PAGE));
  const edit = can("notactive", "edit");
  // M-09 field permissions: a hidden number column or feedback is left out (the API blanks them anyway)
  const fields = useFields("notactive"), fb = fields.shows("feedback");
  const columns = sheet.columns.filter((col) => col !== sheet.numberBy || fields.shows("number"));
  // the headers are the table's keys, so the pick column has a name of its own
  const by = sheet.dedupeBy.join(" + ");
  const showDup = (d: "" | "any" | "none") => { setDup(d); setPage(1); setPick([]); };
  const head = [...(manager ? [t("notActive.pick")] : []), ...columns, t("notActive.status"), ...(fb ? ["Feedback"] : []), t("notActive.with"), ""];
  return (
    <>
      <div className="kpis">
        <KpiTile label={t("notActive.all")} value={c ? num(c.all) : "…"} sub={sheet.name} icon="layers" />
        <KpiTile label={t("notActive.pending")} value={c ? num(c.pending) : "…"} sub={manager ? t("notActive.pendingManager") : t("notActive.pendingMine")} icon="clock" tone="warn" />
        {/* 2.40 · the tile filters to the repeats */}
        <KpiTile label={t("notActive.dupRows")} value={c ? num(c.dupes) : "…"} sub={t("notActive.dupBy", { by: by || "—" })} icon="alert" tone="bad" onClick={() => { setTab("all"); showDup("any"); }} />
        <KpiTile label={t("notActive.matched")} value={c ? num(c.matched) : "…"} sub={t("notActive.matchedSub")} icon="alert" tone="bad" />
      </div>
      <div className="row">
        <Tabs value={tab} onChange={(x) => { setTab(x); setPage(1); setPick([]); }}
          items={[["all", "All Sheet", c?.all], ...NOT_ACTIVE_STATUSES.map((s) => [s, s, c?.[s]] as [NotActiveTab, string, number | undefined])]} />
        <span className="spacer" />
        <label className="field inline"><span>{t("notActive.dupFilter")}</span>
          <select value={dup} onChange={(e) => showDup(e.target.value as "" | "any" | "none")}>
            <option value="">{t("notActive.dupAll")}</option>
            <option value="any">{t("notActive.dupOnly", { count: num(c?.dupes ?? 0) })}</option>
            <option value="none">{t("notActive.dupNone")}</option>
          </select>
        </label>
      </div>
      <div className="na-cols"><span className="hint">{t("notActive.dupByLabel")}</span><b>{by || "—"}</b>
        <span className="hint">{t("notActive.dupRule", { all: sheet.dedupeBy.length > 1 ? "true" : "false" })}{sheet.numberBy ? ` · ${t("notActive.compare", { column: sheet.numberBy })}` : ""}</span>
        {canFile && <button className="btn ghost sm" onClick={() => setDedupe(true)}>{t("notActive.dupChange")}</button>}
      </div>
      {manager && pick.length > 0 && <AssignBar sheetId={sheet.id} rowIds={pick} onDone={() => { setPick([]); void refresh(); }} />}
      {rows.error ? <Note kind="warn">{rows.error.message}</Note> : (
        <Table head={head} empty={rows.data ? t("notActive.noRows") : t("common.loading")} rows={list.map((r) => [
          ...(manager ? [<input key="p" type="checkbox" aria-label={t("notActive.pickOne")} disabled={r.status === "Done"} checked={pick.includes(r.id)}
            onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} />] : []),
          // 2.40 · a repeat's picked cells in red
          ...columns.map((col) => (r.dupes && sheet.dedupeBy.includes(col) ? <span key={col} className="na-dup">{r.data[col] || "—"}</span> : r.data[col] || "—")),
          <StatusCell key="s" r={r} by={by} />,
          ...(fb ? [r.feedback ?? ""] : []),
          r.assignedTo?.name ?? "—",
          // a feedback the person may not write keeps the stored one: Not True goes without the dialog
          <Actions key="a" r={r} manager={manager} edit={edit} onSet={(s) => (s === "Not True" && fields.edits("feedback") ? setNotTrue(r) :s === "Done" && !(manager && r.matched) ? setDone(r) : void classify(r, s))} />,
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
      {dedupe && <DedupeDialog sheet={sheet} onClose={() => setDedupe(false)} />}
    </>
  );
}

function StatusCell({ r, by }: { r: NotActiveRowView; by: string }) {
  const t = useTranslations("inventory.notActive");
  return (
    <>
      {r.status ? <Chip tone={TONE[r.status as NotActiveStatus] ?? ""}>{r.status}</Chip> : <Chip>{t("notYet")}</Chip>}
      {r.dupes > 0 && <span className="sub"><Chip tone="bad">{t("dupChip", { by, count: num(r.dupes) })}</Chip></span>}
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

/** 2.40 · «غيّر خانة منع التكرار» (demo naDupPick): the same chooser as the upload, the count before saving. */
function DedupeDialog({ sheet, onClose }: { sheet: NotActiveSheetView; onClose: () => void }) {
  const t = useTranslations("inventory");
  const run = useAction();
  const qc = useQueryClient();
  const [cols, setCols] = useState(sheet.dedupeBy);
  const count = useQuery({
    queryKey: ["not-active", "dedupe", sheet.id, cols], enabled: cols.length > 0,
    queryFn: () => api.get<{ marked: number }>(`/not-active/sheets/${sheet.id}/dedupe?columns=${encodeURIComponent(JSON.stringify(cols))}`),
  }).data;
  const save = () => void run(async () => {
    await api.put(`/not-active/sheets/${sheet.id}/dedupe`, { columns: cols });
    await qc.invalidateQueries({ queryKey: ["not-active"] });
    onClose();
  }, t("notActive.files.saved"));
  return (
    <Modal title={t("notActive.dupTitle")} onClose={onClose}>
      <DedupeChooser headers={sheet.columns} cols={cols} onToggle={(h, on) => setCols(sheet.columns.filter((x) => (x === h ? on : cols.includes(x))))} />
      {cols.length
        ? <Note>{t.rich("upload.counts2", { marked: count ? num(count.marked) : "…", by: cols.join(" + "), all: cols.length > 1 ? "true" : "false", b: (s) => <b>{s}</b> })}</Note>
        : <Note kind="warn">{t("upload.pickOne")}</Note>}
      <div className="row end"><button className="btn" disabled={!cols.length} onClick={save}>{t("notActive.save")}</button></div>
    </Modal>
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
