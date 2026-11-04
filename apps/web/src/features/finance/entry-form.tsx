"use client";
import { useState } from "react";
import type { EntrySaved, EntryView } from "@places/contracts";
import { Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { flatten, useChart, useRefreshFinance } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
interface Line { accountId: string; debit: string; credit: string }
const blank = (): Line => ({ accountId: "", debit: "", credit: "" });
const cents = (s: string) => Math.round((Number(s) || 0) * 100);

/**
 * 9.13 · «قيد يومية جديد» (demo jeNew / jeSave): date, memo, lines from the chart (code and path), «+ سطر», live totals
 * with «متوازن ✓» or the difference. `entry` = editing a posted manual entry (M-07 43, finance «approve»).
 */
export function EntryForm({ entry, onClose, onSaved }: { entry?: EntryView; onClose: () => void; onSaved: (s: EntrySaved) => void }) {
  const chart = useChart();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [date, setDate] = useState(entry?.date ?? today());
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [lines, setLines] = useState<Line[]>(entry ? entry.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) ? l.debit : "", credit: Number(l.credit) ? l.credit : "" })) : [blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const leaves = chart.data ? flatten(chart.data.roots).filter(({ leaf, node }) => leaf && node.code !== "34") : [];
  const dr = lines.reduce((s, l) => s + cents(l.debit), 0), cr = lines.reduce((s, l) => s + cents(l.credit), 0);
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { date, memo, lines: lines.filter((l) => l.accountId || l.debit || l.credit).map((l) => ({ accountId: l.accountId, debit: l.debit || "0", credit: l.credit || "0" })) };
    setBusy(true);
    await run(async () => {
      const r = entry ? await api.put<EntrySaved>(`/finance/journal/${entry.id}`, body) : await api.post<EntrySaved>("/finance/journal", body);
      await refresh();
      onSaved(r);
    }, entry ? "اتعدّل القيد" : "اتسجّل القيد");
    setBusy(false);
  };
  return (
    <Modal title={entry ? `تعديل قيد ${entry.no}` : "قيد يومية جديد"} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label="التاريخ" req><input type="date" value={date} max={today()} required onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="البيان" req><input value={memo} required minLength={2} placeholder="مثلاً: تسوية فرق جرد الخزنة" onChange={(e) => setMemo(e.target.value)} /></Field>
        <div className="wide tbl-wrap">
          <table className="je">
            <thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 150 }}><select aria-label="الحساب" value={l.accountId} onChange={(e) => set(i, "accountId", e.target.value)}>
                    <option value="">اختار حساب</option>
                    {leaves.map(({ node, path }) => <option key={node.id} value={node.id}>{node.code} · {path.join(" ← ")}</option>)}
                  </select></td>
                  <td><input aria-label="مدين" inputMode="decimal" pattern="\d+(\.\d{1,2})?" style={{ width: "6em" }} value={l.debit} onChange={(e) => set(i, "debit", e.target.value)} /></td>
                  <td><input aria-label="دائن" inputMode="decimal" pattern="\d+(\.\d{1,2})?" style={{ width: "6em" }} value={l.credit} onChange={(e) => set(i, "credit", e.target.value)} /></td>
                  <td>{lines.length > 2 && <button type="button" className="icon-btn sm" aria-label="شيل السطر" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon name="x" /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" />سطر</button></td>
              <td className="num"><b>{money((dr / 100).toFixed(2))}</b></td><td className="num"><b>{money((cr / 100).toFixed(2))}</b></td><td />
            </tr></tfoot>
          </table>
          <p className={`hint ${dr === cr && dr ? "ok-t" : "bad-t"}`}>{dr === cr && dr ? "متوازن ✓" : dr || cr ? `الفرق ${money((Math.abs(dr - cr) / 100).toFixed(2))} · المدين لازم يساوي الدائن` : "المدين لازم يساوي الدائن"}</p>
        </div>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy}><Icon name="check" />{busy ? "بيحفظ…" : entry ? "احفظ التعديل" : "سجّل القيد"}</button></div>
      </form>
    </Modal>
  );
}
