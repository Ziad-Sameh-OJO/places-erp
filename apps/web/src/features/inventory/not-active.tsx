"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
        ? <Note>منار مسؤولة عن الشيتات دي. أي شيت جديد بيتدمج مع الموجود من غير تكرار، وأي رقم موجود في الانفنتوري الأصلي بيجيلها Alarm تحدد حالته.</Note>
        : <Note>دي الأرقام اللي منار بعتتهالك. كلّمي كل رقم وصنّفيه: No Answer، أو Not True (ولازم تكتبي السبب)، أو Done (ودخّلي بيانات الوحدة والصور).</Note>}
      <div className="row">
        {all.length > 0 && <div className="seg" role="group" aria-label="الشيت">
          {all.map((s) => <button key={s.id} aria-pressed={s.id === sheet?.id} onClick={() => setPicked(s.id)}><Icon name="layers" /><span>{s.name}</span></button>)}
        </div>}
        <span className="spacer" />
        {can("notactive", "import") && <button className="btn ghost" onClick={() => setUploading(true)}><Icon name="upload" />ارفع / ادمج شيت (Excel)</button>}
      </div>
      {sheets.error ? <Note kind="warn">{sheets.error.message}</Note>
        : !sheets.data ? <p className="hint">بيحمّل…</p>
        : sheet ? <SheetView key={sheet.id} sheet={sheet} manager={manager} />
        : <Empty text="مفيش شيتات لسه" icon="layers" />}
      <p className="hint">الخانات دي من الشيت نفسه لحد ما الكلاينت يبعت خانات شيت الـ CFC.</p>
      {uploading && <UploadSheet sheets={all} onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); setPicked(id); }} />}
    </>
  );
}

function SheetView({ sheet, manager }: { sheet: NotActiveSheetView; manager: boolean }) {
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
      status === "Not True" ? "اتسجّل Not True بالـ Feedback" : r.matched && !r.matchSeen ? "اتحددت الحالة · والصف فاضل في الشيت" : `اتسجّل ${status}`);
  const c = counts.data;
  const list = rows.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((rows.data?.total ?? 0) / PAGE));
  const edit = can("notactive", "edit");
  // the headers are the table's keys, so the pick column has a name of its own
  const head = [...(manager ? ["تحديد"] : []), ...sheet.columns, "الحالة", "Feedback", "مع مين", ""];
  return (
    <>
      <div className="kpis">
        <KpiTile label="كل الشيت" value={c ? num(c.all) : "…"} sub={sheet.name} icon="layers" />
        <KpiTile label="مستني تصنيف" value={c ? num(c.pending) : "…"} sub={manager ? "مع مروة أو لسه" : "عندك"} icon="clock" tone="warn" />
        <KpiTile label="Done" value={c ? num(c.Done) : "…"} sub="وحدات جديدة" icon="check" tone="ok" />
        <KpiTile label="موجود في الانفنتوري" value={c ? num(c.matched) : "…"} sub="مستني قرار منار" icon="alert" tone="bad" />
      </div>
      <div className="row">
        <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); setPick([]); }}
          items={[["all", "All Sheet", c?.all], ...NOT_ACTIVE_STATUSES.map((s) => [s, s, c?.[s]] as [NotActiveTab, string, number | undefined])]} />
        <span className="spacer" />
        <span className="hint">منع التكرار بخانة «{sheet.dedupeBy}»{sheet.numberBy ? ` · المقارنة بالانفنتوري بخانة «${sheet.numberBy}»` : ""}</span>
      </div>
      {manager && pick.length > 0 && <AssignBar sheetId={sheet.id} rowIds={pick} onDone={() => { setPick([]); void refresh(); }} />}
      {rows.error ? <Note kind="warn">{rows.error.message}</Note> : (
        <Table head={head} empty={rows.data ? "مفيش صفوف في التاب ده" : "بيحمّل…"} rows={list.map((r) => [
          ...(manager ? [<input key="p" type="checkbox" aria-label="حدد" disabled={r.status === "Done"} checked={pick.includes(r.id)}
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
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      {notTrue && <NotTrueDialog onClose={() => setNotTrue(null)} onSave={(fb) => { const r = notTrue; setNotTrue(null); void classify(r, "Not True", fb); }} />}
      {done && <DoneForm sheet={sheet} row={done} onClose={() => setDone(null)} onSaved={() => { setDone(null); void refresh(); }} />}
    </>
  );
}

function StatusCell({ r }: { r: NotActiveRowView }) {
  return (
    <>
      {r.status ? <Chip tone={TONE[r.status as NotActiveStatus] ?? ""}>{r.status}</Chip> : <Chip>لسه</Chip>}
      {r.matched && <span className="sub"><Chip tone="bad">موجود في الانفنتوري {r.matched.code}</Chip></span>}
      {r.unit && <span className="sub mono">{r.unit.code}</span>}
    </>
  );
}

/** Manar decides a number already in the inventory; the person a row was sent to (or Manar) classifies it. Done rows are closed. */
function Actions({ r, manager, edit, onSet }: { r: NotActiveRowView; manager: boolean; edit: boolean; onSet: (s: NotActiveStatus) => void }) {
  if (r.status === "Done" || !edit) return null;
  if (manager && r.matched && !r.matchSeen) {
    return (
      <select aria-label="حالة الرقم" value="" onChange={(e) => e.target.value && onSet(e.target.value as NotActiveStatus)}>
        <option value="">حددي الحالة…</option>{NOT_ACTIVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
  const run = useAction();
  const people = useQuery({ queryKey: ["not-active", "assignees"], queryFn: () => api.get<NotActivePerson[]>("/not-active/assignees") }).data ?? [];
  const [to, setTo] = useState("");
  const target = to || people[0]?.id || "";
  const name = people.find((p) => p.id === target)?.name ?? "";
  return (
    <div className="note"><Icon name="send" />
      <span className="spacer">{num(rowIds.length)} صف متحدد</span>
      <select value={target} onChange={(e) => setTo(e.target.value)} aria-label="ابعت لـ">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="btn sm" disabled={!target} onClick={() => void run(async () => { await api.post(`/not-active/sheets/${sheetId}/assign`, { rowIds, to: target }); onDone(); }, `اتبعت ${num(rowIds.length)} صف لـ ${name}`)}>ابعتهم Task</button>
    </div>
  );
}

/** M-03 2.3: Not True isn't saved without the reason. */
function NotTrueDialog({ onClose, onSave }: { onClose: () => void; onSave: (feedback: string) => void }) {
  const [fb, setFb] = useState("");
  return (
    <Modal title="Not True · لازم Feedback" onClose={onClose}>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); if (fb.trim()) onSave(fb.trim()); }}>
        <Field label="السبب" req wide><textarea required maxLength={500} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="مثلاً: مش صاحب الوحدة" /></Field>
        <div className="row end wide"><button className="btn" disabled={!fb.trim()}>احفظ</button></div>
      </form>
    </Modal>
  );
}

/** Done = a new unit from this number: the main inventory's unit form, the owner's number from the sheet (M-03 1.1). */
function DoneForm({ sheet, row, onClose, onSaved }: { sheet: NotActiveSheetView; row: NotActiveRowView; onClose: () => void; onSaved: () => void }) {
  const options = useQuery({ queryKey: ["not-active", "unit-options"], queryFn: () => api.get<UnitOptions>("/not-active/unit-options"), staleTime: 60_000 });
  return (
    <UnitForm options={options.data} tabs={[]} onClose={onClose} onSaved={onSaved}
      fromSheet={{
        title: `Done · وحدة جديدة من ${sheet.name}`,
        ownerPhone: sheet.numberBy ? row.data[sheet.numberBy] ?? "" : "",
        save: (body) => api.post<CreatedUnit>(`/not-active/rows/${row.id}/done`, body),
      }} />
  );
}
