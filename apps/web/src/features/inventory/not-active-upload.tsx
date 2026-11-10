"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { NotActiveImportDone, NotActivePreview, NotActiveSheetView } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, useAction, useToast } from "@/components/ui";
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
 * the column that tells rows apart («منع التكرار بخانة», e.g. the unit number). The preview says how many rows are
 * new before anything is saved.
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
  const [column, setColumn] = useState("");
  const [numberCol, setNumberCol] = useState("");
  const [p, setP] = useState<NotActivePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const step = async (fn: () => Promise<void>) => { setBusy(true); try { await run(fn); } finally { setBusy(false); } };
  const look = (f: File, n: string, c: string) => step(async () => {
    const r = await api.post<NotActivePreview>("/not-active/preview", form(f, { name: n.trim(), dedupeBy: c }));
    // the column: the one picked if the file has it, else the sheet's own, else the file's first
    const col = r.headers.includes(c) ? c : r.sheet && r.headers.includes(r.sheet.dedupeBy) ? r.sheet.dedupeBy : r.headers[0] ?? "";
    setColumn(col);
    setNumberCol((n) => (n && r.headers.includes(n) ? n : r.numberGuess ?? ""));
    setP(col !== c ? await api.post<NotActivePreview>("/not-active/preview", form(f, { name: n.trim(), dedupeBy: col })) : r);
  });
  const pick = (f: File | undefined) => { setFile(f ?? null); setP(null); if (f) void look(f, name, column); };
  // the file picked in «ملف جديد» goes in once, when the dialog opens
  useEffect(() => { if (initial) pick(initial); }, []);
  const merge = () => step(async () => {
    const r = await api.post<NotActiveImportDone>("/not-active/import", form(file!, { name: name.trim(), dedupeBy: column, numberBy: numberCol }));
    await qc.invalidateQueries({ queryKey: ["not-active"] });
    toast(`${t("upload.merged", { added: num(r.added), duplicates: num(r.duplicates) })}${r.noKey ? ` · ${t("upload.noKeyCount", { count: num(r.noKey), column })}` : ""}${r.inInventory ? ` · ${t("upload.inInventory", { count: num(r.inInventory) })}` : ""}`);
    onDone(r.sheetId);
  });
  return (
    <Modal title={into ? t("upload.intoTitle", { name: into.name }) : t("upload.title")} onClose={onClose}>
      <div className="row">
        <label className="btn ghost">
          <Icon name="upload" />{file ? file.name : t("upload.pickFile")}
          <input type="file" hidden accept=".xlsx,.csv" aria-label={t("upload.fileLabel")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div className="grid">
        {!into && <Field label={t("upload.sheetName")} req>
          <input value={name} list="na-sheets" maxLength={60} placeholder={t("upload.sheetExample")} onChange={(e) => setName(e.target.value)} onBlur={() => file && void look(file, name, column)} />
          <datalist id="na-sheets">{sheets.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>}
        {p && <Field label={t("upload.dedupeBy")} req>
          <select value={column} onChange={(e) => { setColumn(e.target.value); if (file) void look(file, name, e.target.value); }}>
            {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>}
        {/* M-03 1.1: the «Number» column is compared with the owners' numbers in the inventory */}
        {p && <Field label={t("upload.numberBy")}>
          <select value={numberCol} onChange={(e) => setNumberCol(e.target.value)}>
            <option value="">{t("upload.noCompare")}</option>
            {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>}
      </div>
      {busy && !p && <p className="hint">{t("upload.reading")}</p>}
      {p && <>
        <Note>{p.sheet ? t("upload.mergeInto", { name: p.sheet.name, rows: num(p.sheet.rows), column }) : name.trim() ? t("upload.newNamed", { name: name.trim() }) : t("upload.newUnnamed")}</Note>
        <div className="row">
          <Chip plain>{t("upload.inFile", { count: num(p.total) })}</Chip>
          {p.added != null && <Chip tone="ok">{t("upload.toAdd", { count: num(p.added) })}</Chip>}
          {!!p.duplicates && <Chip tone="warn">{t("upload.dupes", { count: num(p.duplicates) })}</Chip>}
          {!!p.noKey && <Chip tone="bad">{t("upload.noKey", { column, count: num(p.noKey) })}</Chip>}
        </div>
        <Table head={p.headers} rows={p.sample.map((r) => p.headers.map((h) => r[h] ?? ""))} />
        {p.total > p.sample.length && <p className="hint">{t("upload.sample", { shown: p.sample.length, total: num(p.total) })}</p>}
      </>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button type="button" className="btn" disabled={!p || busy || !name.trim() || !column || !p.added} onClick={() => void merge()}>
          {busy && p ? t("common.saving") : `${t("upload.merge")}${p?.added ? ` · ${t("upload.rows", { count: num(p.added) })}` : ""}`}
        </button>
      </div>
    </Modal>
  );
}
