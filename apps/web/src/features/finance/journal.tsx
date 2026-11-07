"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { EntrySaved, MoveEffect, PeriodView } from "@places/contracts";
import { Chip, Empty, Icon, Modal, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { EntryForm } from "./entry-form";
import { printBlock } from "./print";
import { useEntry, useJournal, useRefreshFinance, type JournalQuery } from "./use-finance";

const PAGE = 25;

/** 9.5 · دفتر اليومية + 9.13 «قيد يومية جديد» + 9.8 the periods and «اقفل الشهر / الربع». */
export function Journal() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const [f, setF] = useState<JournalQuery>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [saved, setSaved] = useState<EntrySaved | null>(null);
  const q = useJournal(f, page, PAGE);
  const set = (k: keyof JournalQuery, v: string) => { setF((o) => ({ ...o, [k]: v || undefined })); setPage(1); };
  const d = q.data;
  return (
    <>
      <Periods />
      <div className="row">
        <input type="search" placeholder={t("journal.search")} onChange={(e) => set("q", e.target.value)} />
        <label className="hint">{t("common.from")} <input type="date" onChange={(e) => set("from", e.target.value)} /></label>
        <label className="hint">{t("common.until")} <input type="date" onChange={(e) => set("to", e.target.value)} /></label>
        <span className="spacer" />
        {can("finance", "create") && <button className="btn" onClick={() => setForm(true)}><Icon name="plus" />{t("entry.newTitle")}</button>}
      </div>
      {!d ? <Empty text={t("common.loading")} icon="clock" /> : (
        <>
          <Note kind={d.totals.balanced ? "ok" : "warn"}>{t("journal.note", { debit: money(d.totals.debit), credit: money(d.totals.credit) })} · {d.totals.balanced ? t("common.balanced") : t("journal.unbalanced")}</Note>
          <Table head={[t("journal.entry"), t("common.date"), t("journal.type"), t("common.memo"), t("common.amount"), t("journal.by")]} empty={t("journal.empty")} onRow={(i) => setOpen(d.items[i]!.id)}
            rows={d.items.map((e) => [<b key="n" className="mono">{e.no}</b>, e.date.slice(0, 10), serverText(e.nature), e.memo, money(e.debit), e.by])} />
          {d.total > PAGE && (
            <div className="row">
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</button>
              <span className="hint">{t("common.pageOf", { page: String(page), pages: String(Math.ceil(d.total / PAGE)) })}</span>
              <button className="btn ghost sm" disabled={page * PAGE >= d.total} onClick={() => setPage(page + 1)}>{t("common.next")}</button>
            </div>
          )}
        </>
      )}
      {form && <EntryForm onClose={() => setForm(false)} onSaved={(s) => { setForm(false); setSaved(s); }} />}
      {saved && <EntryModal id={saved.entry.id} effect={saved.effect} onClose={() => setSaved(null)} />}
      {open && <EntryModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The months and their status; «اقفل الشهر» / «اقفل الربع» for finance «approve» (demo closeMonth / closeQuarter). */
function Periods() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const run = useAction();
  const refresh = useRefreshFinance();
  const q = useQuery({ queryKey: ["finance", "periods"], queryFn: () => api.get<PeriodView[]>("/finance/periods") });
  if (!q.data) return null;
  const cur = q.data.at(-1)!;
  const close = (kind: "month" | "quarter") => run(async () => { await api.post("/finance/periods/close", { kind }); await refresh(); }, kind === "month" ? t("journal.monthClosed", { label: serverText(cur.label) }) : t("journal.quarterClosed"));
  return (
    <div className="row">
      {q.data.map((p) => <Chip key={p.month} tone={p.status === "open" ? "warn" : "ok"}>{serverText(p.label)} · {serverText(p.statusLabel)}</Chip>)}
      <span className="spacer" />
      {can("finance", "approve") && cur.status === "open" && <>
        <button className="btn ghost sm" onClick={() => void close("month")}><Icon name="lock" />{t("journal.closeMonth")}</button>
        <button className="btn ghost sm" onClick={() => void close("quarter")}><Icon name="lock" />{t("journal.closeQuarter")}</button>
      </>}
    </div>
  );
}

/** One entry: its lines, «الأثر على شجرة الحسابات» right after saving, printable; a manual one can be edited (43). */
function EntryModal({ id, effect, onClose }: { id: string; effect?: MoveEffect[]; onClose: () => void }) {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = useEntry(id);
  const ref = useRef<HTMLDivElement>(null);
  const [edit, setEdit] = useState(false);
  const [after, setAfter] = useState<MoveEffect[] | undefined>(effect);
  const e = q.data;
  if (edit && e) return <EntryForm entry={e} onClose={() => setEdit(false)} onSaved={(s) => { setEdit(false); setAfter(s.effect); }} />;
  return (
    <Modal title={e ? t("journal.entryTitle", { no: e.no }) : t("journal.theEntry")} onClose={onClose}>
      {!e ? <Empty text={t("common.loading")} icon="clock" /> : (
        <>
          <div ref={ref}><div className="pdf">
            <div className="pdf-head"><b>Places · {t("journal.journalEntry")}</b><span className="mono">{e.no}</span></div>
            <p className="hint">{e.date.slice(0, 10)} · {serverText(e.nature)} · {e.memo} · {e.by}</p>
            <table className="je">
              <thead><tr><th>{t("common.account")}</th><th>{t("common.debit")}</th><th>{t("common.credit")}</th></tr></thead>
              <tbody>
                {e.lines.map((l, i) => <tr key={i}><td><span className="mono">{l.code}</span> {serverText(l.name)}</td><td className="num">{Number(l.debit) ? money(l.debit) : ""}</td><td className="num">{Number(l.credit) ? money(l.credit) : ""}</td></tr>)}
                <tr><td><b>{t("journal.total")}</b></td><td className="num"><b>{money(e.debit)}</b></td><td className="num"><b>{money(e.credit)}</b></td></tr>
              </tbody>
            </table>
            {after && <>
              <h4 className="mini-h">{t("common.effect")}</h4>
              <table className="je"><thead><tr><th>{t("common.account")}</th><th>{t("common.before")}</th><th>{t("common.after")}</th></tr></thead>
                <tbody>{after.map((x) => <tr key={x.code}><td><span className="mono">{x.code}</span> {serverText(x.name)}</td><td className="num">{money(x.before)}</td><td className="num"><b>{money(x.after)}</b></td></tr>)}</tbody></table>
            </>}
          </div></div>
          <div className="row end no-print">
            {e.source === "manual" && can("finance", "approve") && <button className="btn ghost sm" onClick={() => setEdit(true)}><Icon name="filter" />{t("journal.edit")}</button>}
            <button className="btn ghost sm" onClick={() => printBlock(ref.current)}><Icon name="file" />{t("journal.print")}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
