"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EntrySaved, EntryView } from "@places/contracts";
import { Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "./money";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { only } from "./field-lock";
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
  const t = useTranslations("finance");
  const chart = useChart();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [date, setDate] = useState(entry?.date ?? today());
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [lines, setLines] = useState<Line[]>(entry ? entry.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) ? l.debit : "", credit: Number(l.credit) ? l.credit : "" })) : [blank(), blank()]);
  const [busy, setBusy] = useState(false);
  // M-09: a read-only amount locks the lines (the API keeps them as posted); a read-only memo is locked, a hidden one gone
  const fields = useFields("finance");
  const lock = !fields.edits("amount");
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
    }, entry ? t("entry.edited") : t("entry.saved"));
    setBusy(false);
  };
  return (
    <Modal title={entry ? t("entry.editTitle", { no: entry.no }) : t("entry.newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label={t("common.date")} req><input type="date" value={date} max={today()} required onChange={(e) => setDate(e.target.value)} /></Field>
        {only(fields, "memo", <Field label={t("common.memo")} req><input value={memo} required minLength={2} placeholder={t("entry.memoPlaceholder")} onChange={(e) => setMemo(e.target.value)} /></Field>)}
        <div className="wide tbl-wrap">
          <fieldset className="field-lock" disabled={lock}><table className="je">
            <thead><tr><th>{t("common.account")}</th><th>{t("common.debit")}</th><th>{t("common.credit")}</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 150 }}><select aria-label={t("common.account")} value={l.accountId} onChange={(e) => set(i, "accountId", e.target.value)}>
                    <option value="">{t("entry.chooseAccount")}</option>
                    {leaves.map(({ node, path }) => <option key={node.id} value={node.id}>{node.code} · {path.map(serverText).join(t("common.pathSep"))}</option>)}
                  </select></td>
                  <td><input aria-label={t("common.debit")} inputMode="decimal" pattern="\d+(\.\d{1,2})?" style={{ width: "6em" }} value={l.debit} onChange={(e) => set(i, "debit", e.target.value)} /></td>
                  <td><input aria-label={t("common.credit")} inputMode="decimal" pattern="\d+(\.\d{1,2})?" style={{ width: "6em" }} value={l.credit} onChange={(e) => set(i, "credit", e.target.value)} /></td>
                  <td>{lines.length > 2 && <button type="button" className="icon-btn sm" aria-label={t("entry.removeLine")} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon name="x" /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" />{t("entry.line")}</button></td>
              <td className="num"><b>{money((dr / 100).toFixed(2))}</b></td><td className="num"><b>{money((cr / 100).toFixed(2))}</b></td><td />
            </tr></tfoot>
          </table></fieldset>
          <p className={`hint ${dr === cr && dr ? "ok-t" : "bad-t"}`}>{dr === cr && dr ? t("common.balanced") : dr || cr ? t("entry.diff", { amount: money((Math.abs(dr - cr) / 100).toFixed(2)) }) : t("entry.mustEqual")}</p>
        </div>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button><button className="btn" disabled={busy}><Icon name="check" />{busy ? t("common.saving") : entry ? t("entry.saveEdit") : t("entry.submit")}</button></div>
      </form>
    </Modal>
  );
}
