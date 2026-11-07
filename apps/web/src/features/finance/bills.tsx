"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BillView, CashView, MoveEffect, MoveView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useBills, useCash, useRefreshFinance } from "./use-finance";
import { MoveForm, type MovePrefill } from "./move-form";
import { Voucher, VoucherById } from "./voucher";

const TONE: Record<BillView["state"], "ok" | "warn" | ""> = { paid: "ok", skipped: "", off: "", due: "warn", soon: "warn", later: "" };

/** «وافق واصرف» + «مش الشهر ده» for one bill, shared by the tab and the card in «الخزن والحركات». */
function useBillActions(cash: CashView | undefined, label: string) {
  const t = useTranslations("finance");
  const [pay, setPay] = useState<MovePrefill | null>(null);
  const [skip, setSkip] = useState<BillView | null>(null);
  const [saved, setSaved] = useState<{ move: MoveView; effect: MoveEffect[] } | null>(null);
  const run = useAction();
  const refresh = useRefreshFinance();
  const open = (b: BillView) => setPay({ billId: b.id, fromId: b.from.id, accountId: b.account.id, amount: b.amount, party: b.vendor, memo: `${b.name} · ${label}`,
    note: t("bills.payNote", { name: b.name, day: String(b.day), amount: money(b.amount) }) });
  const ui = (
    <>
      {pay && cash && <MoveForm kind="pay" cash={cash} prefill={pay} onClose={() => setPay(null)} onSaved={(s) => { setPay(null); setSaved(s); }} />}
      {saved && <Voucher move={saved.move} effect={saved.effect} onClose={() => setSaved(null)} />}
      {skip && (
        <Modal title={t("bills.skipTitle", { name: skip.name })} onClose={() => setSkip(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (d) => run(async () => { await api.post(`/finance/bills/${skip.id}/skip`, { reason: String(d.get("reason") ?? "") }); await refresh(); setSkip(null); }, t("bills.skipped")))}>
            <Field label={t("bills.skipWhy")} req wide><input name="reason" required minLength={2} /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setSkip(null)}>{t("common.cancel")}</button><button className="btn">{t("common.record")}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
  return { open, skip: setSkip, ui };
}

/** The card in «الخزن والحركات» (demo billCard): only the bills whose day came. */
export function DueBillsCard({ cash }: { cash: CashView }) {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = useBills();
  const a = useBillActions(cash, q.data?.label ?? "");
  const due = q.data?.items.filter((b) => b.state === "due") ?? [];
  if (!due.length) return a.ui;
  return (
    <>
      <Card title={t("bills.dueTitle")} icon="calendar" sub={t("bills.dueSub")} className="attn" extra={<Chip tone="warn">{due.length}</Chip>}>
        <Table head={[t("bills.bill"), t("common.item"), t("bills.due"), t("bills.usualAmount"), ""]} rows={due.map((b) => [
          <span key="n"><b>{b.name}</b><span className="sub">{b.vendor}</span></span>, serverText(b.account.name), t("bills.dayOf", { day: String(b.day) }), <b key="a">{money(b.amount)}</b>,
          can("finance", "create") ? <span key="x" className="row"><button className="btn sm" onClick={() => a.open(b)}>{t("bills.approvePay")}</button><button className="btn ghost sm" onClick={() => a.skip(b)}>{t("bills.notThisMonth")}</button></span> : "",
        ])} />
      </Card>
      {a.ui}
    </>
  );
}

/** M-07 · «الفواتير الثابتة» (9.16): every bill, its state this month, its voucher or reason, stop / start, and a new one. */
export function Bills() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = useBills();
  const cash = useCash();
  const run = useAction();
  const refresh = useRefreshFinance();
  const a = useBillActions(cash.data, q.data?.label ?? "");
  const [voucher, setVoucher] = useState<string | null>(null);
  if (!q.data || !cash.data) return <Empty text={t("common.loading")} icon="clock" />;
  const canPost = can("finance", "create"), canEdit = can("finance", "edit");
  const toggle = (b: BillView) => run(async () => { await api.patch(`/finance/bills/${b.id}`, { active: !b.active }); await refresh(); }, b.active ? t("bills.stopped") : t("bills.started"));
  const add = onFormSubmit(async (d) => run(async () => {
    await api.post("/finance/bills", { name: d.get("name"), vendor: d.get("vendor"), accountId: d.get("accountId"), fromId: d.get("fromId"), amount: d.get("amount"), day: Number(d.get("day")) });
    await refresh();
  }, t("bills.added")));
  return (
    <>
      <Note>{t("bills.note")}</Note>
      <Table head={[t("bills.bill"), t("common.item"), t("common.from"), t("bills.day"), t("common.amount"), serverText(q.data.label), ""]} empty={t("bills.empty")}
        rows={q.data.items.map((b) => [
          <span key="n"><b>{b.name}</b><span className="sub">{b.vendor}</span></span>, `${b.account.code} · ${serverText(b.account.name)}`, serverText(b.from.name), b.day, money(b.amount),
          <span key="s"><Chip tone={TONE[b.state]}>{serverText(b.stateLabel)}</Chip>{b.move && <> <a className="mono click" onClick={() => setVoucher(b.move!.id)}>{b.move.no}</a></>}{b.reason && <span className="sub">{b.reason}</span>}</span>,
          <span key="x" className="row">
            {canPost && (b.state === "due" || b.state === "soon") && <button className="btn sm" onClick={() => a.open(b)}>{t("bills.approvePay")}</button>}
            {canPost && b.state === "due" && <button className="btn ghost sm" onClick={() => a.skip(b)}>{t("bills.notThisMonth")}</button>}
            {canEdit && <button className="btn ghost sm" onClick={() => void toggle(b)}>{b.active ? t("bills.stop") : t("bills.start")}</button>}
          </span>,
        ])} />
      {canPost && (
        <form className="card flat grid" onSubmit={add}>
          <Field label={t("bills.bill")} req><input name="name" required placeholder={t("bills.namePlaceholder")} /></Field>
          <Field label={t("bills.vendor")} req><input name="vendor" required /></Field>
          <Field label={t("common.item")} req><select name="accountId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.data.expenses.map((e) => <option key={e.id} value={e.id}>{e.code} · {serverText(e.name)}</option>)}</select></Field>
          <Field label={t("bills.usualAmount")} req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
          <Field label={t("bills.dayOfMonth")} req><input name="day" type="number" min={1} max={28} defaultValue={1} required /></Field>
          <Field label={t("common.paidFrom")} req><select name="fromId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.data.accounts.map((x) => <option key={x.id} value={x.id}>{serverText(x.name)}</option>)}</select></Field>
          <div className="row end wide"><button className="btn"><Icon name="plus" />{t("bills.add")}</button></div>
        </form>
      )}
      {a.ui}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </>
  );
}
