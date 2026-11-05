"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NotActiveRowView, NotActiveSheetView, Paged } from "@places/contracts";
import { Empty, Icon, Note, Table } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { UploadSheet } from "./not-active-upload";

const PAGE = 100;

/**
 * M-03 · Not Active Inventory (demo notactive.js, 2.14): the sheets Manar uploaded, one at a time, with their rows as
 * they came. A sheet's columns are its own until the client sends the CFC sheet's. The tabs, the comparison with the
 * inventory and Marwa's classification come with 2.15.
 */
export function NotActivePage() {
  const { can } = useMe();
  const sheets = useQuery({ queryKey: ["not-active", "sheets"], queryFn: () => api.get<NotActiveSheetView[]>("/not-active/sheets") });
  const [picked, setPicked] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const all = sheets.data ?? [];
  const sheet = all.find((s) => s.id === picked) ?? all[0];
  return (
    <>
      <Note>منار مسؤولة عن الشيتات دي. أي شيت جديد بيتدمج مع الموجود من غير تكرار، وأي رقم موجود في الانفنتوري الأصلي بيجيلها Alarm تحدد حالته.</Note>
      <div className="row">
        {all.length > 0 && <div className="seg" role="group" aria-label="الشيت">
          {all.map((s) => <button key={s.id} aria-pressed={s.id === sheet?.id} onClick={() => setPicked(s.id)}><Icon name="layers" /><span>{s.name}</span></button>)}
        </div>}
        <span className="spacer" />
        {can("notactive", "import") && <button className="btn ghost" onClick={() => setUploading(true)}><Icon name="upload" />ارفع / ادمج شيت (Excel)</button>}
      </div>
      {sheets.error ? <Note kind="warn">{sheets.error.message}</Note>
        : !sheets.data ? <p className="hint">بيحمّل…</p>
        : sheet ? <SheetRows key={sheet.id} sheet={sheet} />
        : <Empty text="مفيش شيتات لسه" icon="layers" />}
      <p className="hint">الخانات دي من الشيت نفسه لحد ما الكلاينت يبعت خانات شيت الـ CFC.</p>
      {uploading && <UploadSheet sheets={all} onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); setPicked(id); }} />}
    </>
  );
}

function SheetRows({ sheet }: { sheet: NotActiveSheetView }) {
  const [page, setPage] = useState(1);
  const rows = useQuery({
    queryKey: ["not-active", "rows", sheet.id, page],
    queryFn: () => api.get<Paged<NotActiveRowView>>(`/not-active/sheets/${sheet.id}/rows?page=${page}&pageSize=${PAGE}`),
  });
  const list = rows.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((rows.data?.total ?? 0) / PAGE));
  return (
    <>
      <div className="row"><span className="hint num">{num(sheet.rows)} صف · منع التكرار بخانة «{sheet.dedupeBy}»</span></div>
      {rows.error ? <Note kind="warn">{rows.error.message}</Note>
        : <Table head={sheet.columns} rows={list.map((r) => sheet.columns.map((c) => r.data[c] ?? "—"))} empty={rows.data ? "الشيت فاضي" : "بيحمّل…"} />}
      {pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </>
  );
}
