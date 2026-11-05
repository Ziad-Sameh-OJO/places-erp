"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
export function UploadSheet({ sheets, onClose, onDone }: { sheets: NotActiveSheetView[]; onClose: () => void; onDone: (sheetId: string) => void }) {
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(sheets[0]?.name ?? "");
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
  const merge = () => step(async () => {
    const r = await api.post<NotActiveImportDone>("/not-active/import", form(file!, { name: name.trim(), dedupeBy: column, numberBy: numberCol }));
    await qc.invalidateQueries({ queryKey: ["not-active"] });
    toast(`اتضاف ${num(r.added)} صف · اتساب ${num(r.duplicates)} مكرر${r.noKey ? ` · ${num(r.noKey)} من غير «${column}»` : ""}${r.inInventory ? ` · ${num(r.inInventory)} موجود في الانفنتوري` : ""}`);
    onDone(r.sheetId);
  });
  return (
    <Modal title="ارفع / ادمج شيت" onClose={onClose}>
      <div className="row">
        <label className="btn ghost">
          <Icon name="upload" />{file ? file.name : "اختار ملف Excel أو CSV"}
          <input type="file" hidden accept=".xlsx,.csv" aria-label="ملف الشيت" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div className="grid">
        <Field label="اسم الشيت" req>
          <input value={name} list="na-sheets" maxLength={60} placeholder="مثلاً CFC" onChange={(e) => setName(e.target.value)} onBlur={() => file && void look(file, name, column)} />
          <datalist id="na-sheets">{sheets.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        {p && <Field label="منع التكرار بخانة" req>
          <select value={column} onChange={(e) => { setColumn(e.target.value); if (file) void look(file, name, e.target.value); }}>
            {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>}
        {/* M-03 1.1: the «Number» column is compared with the owners' numbers in the inventory */}
        {p && <Field label="خانة الرقم (للمقارنة بالانفنتوري)">
          <select value={numberCol} onChange={(e) => setNumberCol(e.target.value)}>
            <option value="">من غير مقارنة</option>
            {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>}
      </div>
      {busy && !p && <p className="hint">بيقرا الشيت…</p>}
      {p && <>
        <Note>{p.sheet ? `هيتدمج مع شيت «${p.sheet.name}» (${num(p.sheet.rows)} صف): أي صف قيمته في «${column}» موجودة قبل كده مش هيتضاف.` : name.trim() ? `شيت جديد باسم «${name.trim()}».` : "شيت جديد · اكتب اسمه."}</Note>
        <div className="row">
          <Chip plain>{num(p.total)} صف في الملف</Chip>
          {p.added != null && <Chip tone="ok">هيتضاف {num(p.added)}</Chip>}
          {!!p.duplicates && <Chip tone="warn">مكرر {num(p.duplicates)}</Chip>}
          {!!p.noKey && <Chip tone="bad">من غير «{column}» {num(p.noKey)}</Chip>}
        </div>
        <Table head={p.headers} rows={p.sample.map((r) => p.headers.map((h) => r[h] ?? ""))} />
        {p.total > p.sample.length && <p className="hint">ظاهر أول {p.sample.length} صف من {num(p.total)}.</p>}
      </>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
        <button type="button" className="btn" disabled={!p || busy || !name.trim() || !column || !p.added} onClick={() => void merge()}>
          {busy && p ? "بيحفظ…" : `ادمج${p?.added ? ` · ${num(p.added)} صف` : ""}`}
        </button>
      </div>
    </Modal>
  );
}
