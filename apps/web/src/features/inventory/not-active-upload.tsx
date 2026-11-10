"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { NotActiveImportDone, NotActivePreview, NotActiveSheetView } from "@places/contracts";
import { Field, Icon, Modal, Note, Table, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

const form = (file: File, fields: Record<string, string>) => {
  const f = new FormData();
  f.append("file", file);
  for (const [k, v] of Object.entries(fields)) if (v) f.append(k, v);
  return f;
};

/**
 * «ارفع / ادمج شيت (Excel)» (M-03 1.1 · 2.1 step 12): the file, the sheet's name (an existing one merges into it) and
 * 2.40 · the column(s) that tell a repeat (all must match) and what happens to repeats: in and marked red, or left out.
 * The preview counts both before anything is saved (demo dupModal).
 */
export function UploadSheet({ sheets, onClose, onDone, file: into, initial }: {
  sheets: NotActiveSheetView[]; onClose: () => void; onDone: (sheetId: string) => void;
  /** 2.39 · uploading inside a file: its name is fixed (no name field), and the file picked in «ملف جديد» starts it */
  file?: NotActiveSheetView; initial?: File | null;
}) {
  const t = useTranslations("inventory");
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(into?.name ?? sheets[0]?.name ?? "");
  const [cols, setCols] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  const [numberCol, setNumberCol] = useState("");
  const [p, setP] = useState<NotActivePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0); // only the last check's answer is shown
  const step = async (fn: () => Promise<void>) => { setBusy(true); try { await run(fn); } finally { setBusy(false); } };
  // 2.40 · the column(s): the ones picked, else the file's own, else the number column (the API decides and says which)
  const look = (f: File, n: string, c: string[]) => {
    const at = ++latest.current;
    return step(async () => {
      const r = await api.post<NotActivePreview>("/not-active/preview", form(f, { name: n.trim(), ...(c.length ? { dedupeBy: JSON.stringify(c) } : {}) }));
      if (at !== latest.current) return;
      setCols(r.dedupeBy);
      setNumberCol((x) => (x && r.headers.includes(x) ? x : r.numberGuess ?? ""));
      setP(r);
    });
  };
  const pick = (f: File | undefined) => { setFile(f ?? null); setP(null); if (f) void look(f, name, cols); };
  // the file picked in «ملف جديد» goes in once, when the dialog opens
  useEffect(() => { if (initial) pick(initial); }, []);
  const toggle = (h: string, on: boolean) => {
    const next = p!.headers.filter((x) => (x === h ? on : cols.includes(x)));
    setCols(next);
    if (next.length && file) void look(file, name, next);
  };
  const merge = () => step(async () => {
    const r = await api.post<NotActiveImportDone>("/not-active/import", form(file!, { name: name.trim(), dedupeBy: JSON.stringify(cols), numberBy: numberCol, skipDupes: String(skip) }));
    await qc.invalidateQueries({ queryKey: ["not-active"] });
    const dup = r.skipped ? ` · ${t("upload.skipped", { count: num(r.skipped) })}` : r.marked ? ` · ${t("upload.markedCount", { count: num(r.marked) })}` : "";
    toast(`${t("upload.added", { count: num(r.added) })}${dup}${r.inInventory ? ` · ${t("upload.inInventory", { count: num(r.inInventory) })}` : ""}`);
    onDone(r.sheetId);
  });
  const by = cols.join(" + ");
  return (
    <Modal title={into ? t("upload.intoTitle", { name: into.name }) : t("upload.title")} onClose={onClose}>
      <div className="row">
        <label className="btn ghost">
          <Icon name="upload" />{file ? file.name : t("upload.pickFile")}
          <input type="file" hidden accept=".xlsx,.csv" aria-label={t("upload.fileLabel")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {!into && <div className="grid">
        <Field label={t("upload.sheetName")} req>
          <input value={name} list="na-sheets" maxLength={60} placeholder={t("upload.sheetExample")} onChange={(e) => setName(e.target.value)} onBlur={() => file && void look(file, name, cols)} />
          <datalist id="na-sheets">{sheets.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
      </div>}
      {busy && !p && <p className="hint">{t("upload.reading")}</p>}
      {p && <>
        <Note>{t.rich("upload.intro", { count: num(p.total), b: (s) => <b>{s}</b> })}</Note>
        {/* 2.40 · «منع التكرار»: one or more columns, all must match (demo dupChooser) */}
        <DedupeChooser headers={p.headers} cols={cols} onToggle={toggle} />
        {cols.length
          ? <Note>{t.rich("upload.counts", { marked: num(p.marked), skip: num(p.duplicates), by, all: cols.length > 1 ? "true" : "false", b: (s) => <b>{s}</b> })}</Note>
          : <Note kind="warn">{t("upload.pickOne")}</Note>}
        <div className="grid">
          <Field label={t("upload.dupRows")}>
            <select value={skip ? "skip" : "mark"} onChange={(e) => setSkip(e.target.value === "skip")}>
              <option value="mark">{t("upload.mark")}</option>
              <option value="skip">{t("upload.skip")}</option>
            </select>
          </Field>
          {/* M-03 1.1: the «Number» column is compared with the owners' numbers in the inventory */}
          <Field label={t("upload.numberBy")}>
            <select value={numberCol} onChange={(e) => setNumberCol(e.target.value)}>
              <option value="">{t("upload.noCompare")}</option>
              {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
        </div>
        {p.sheet && <p className="hint">{t("upload.mergeIntoFile", { name: p.sheet.name, rows: num(p.sheet.rows) })}</p>}
        <Table head={p.headers} rows={p.sample.map((r) => p.headers.map((h) => r[h] ?? ""))} />
        {p.total > p.sample.length && <p className="hint">{t("upload.sample", { shown: p.sample.length, total: num(p.total) })}</p>}
      </>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button type="button" className="btn" disabled={!p || busy || !name.trim() || !cols.length || !p.total} onClick={() => void merge()}>
          {busy && p ? t("common.saving") : <><Icon name="upload" />{t("upload.go")}</>}
        </button>
      </div>
    </Modal>
  );
}

/** «منع التكرار بـ:» the file's columns as checkboxes (the demo's na-cols). */
export function DedupeChooser({ headers, cols, onToggle }: { headers: string[]; cols: string[]; onToggle: (h: string, on: boolean) => void }) {
  return <div className="na-cols">
    {headers.map((h) => <label key={h} className="tog"><input type="checkbox" checked={cols.includes(h)} onChange={(e) => onToggle(h, e.target.checked)} /><span>{h}</span></label>)}
  </div>;
}
