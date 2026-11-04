"use client";
import { useState } from "react";
import { Empty, Modal, Note, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { useEntry, useJournal, type JournalQuery } from "./use-finance";

const PAGE = 25;

/** 9.5 · دفتر اليومية: every entry, newest first, with the period's totals (debit = credit). */
export function Journal() {
  const [f, setF] = useState<JournalQuery>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useJournal(f, page, PAGE);
  const set = (k: keyof JournalQuery, v: string) => { setF((o) => ({ ...o, [k]: v || undefined })); setPage(1); };
  const d = q.data;
  return (
    <>
      <div className="row">
        <input type="search" placeholder="دوّر في البيان أو رقم القيد" onChange={(e) => set("q", e.target.value)} />
        <label className="hint">من <input type="date" onChange={(e) => set("from", e.target.value)} /></label>
        <label className="hint">لحد <input type="date" onChange={(e) => set("to", e.target.value)} /></label>
      </div>
      {!d ? <Empty text="بيحمّل…" icon="clock" /> : (
        <>
          <Note kind={d.totals.balanced ? "ok" : "warn"}>إجمالي المدين {money(d.totals.debit)} · إجمالي الدائن {money(d.totals.credit)} · {d.totals.balanced ? "متوازن" : "فيه فرق"}</Note>
          <Table head={["القيد", "التاريخ", "النوع", "البيان", "المبلغ", "بواسطة"]} empty="مفيش قيود" onRow={(i) => setOpen(d.items[i]!.id)}
            rows={d.items.map((e) => [<b key="n" className="mono">{e.no}</b>, e.date.slice(0, 10), e.nature, e.memo, money(e.debit), e.by])} />
          {d.total > PAGE && (
            <div className="row">
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
              <span className="hint">{page} من {Math.ceil(d.total / PAGE)}</span>
              <button className="btn ghost sm" disabled={page * PAGE >= d.total} onClick={() => setPage(page + 1)}>اللي بعده</button>
            </div>
          )}
        </>
      )}
      {open && <EntryModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function EntryModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useEntry(id);
  const e = q.data;
  return (
    <Modal title={e ? `قيد ${e.no}` : "القيد"} onClose={onClose}>
      {!e ? <Empty text="بيحمّل…" icon="clock" /> : (
        <>
          <p className="hint">{e.date.slice(0, 10)} · {e.nature} · {e.memo} · {e.by}</p>
          <table className="je">
            <thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
            <tbody>
              {e.lines.map((l, i) => <tr key={i}><td><span className="mono">{l.code}</span> {l.name}</td><td className="num">{Number(l.debit) ? money(l.debit) : ""}</td><td className="num">{Number(l.credit) ? money(l.credit) : ""}</td></tr>)}
              <tr><td><b>الإجمالي</b></td><td className="num"><b>{money(e.debit)}</b></td><td className="num"><b>{money(e.credit)}</b></td></tr>
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
