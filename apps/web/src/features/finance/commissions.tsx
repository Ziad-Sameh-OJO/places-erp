"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { CommissionPaid, CommissionPerson, CommissionStatement } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useCash, useCommission, useCommissionPeople, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
// the tone follows the state the API sends (in Arabic), before it's translated for display
const tone = (state: string) => (state.startsWith("مستحقة") ? "ok" : state.startsWith("مستنية") ? "warn" : "");
const rate = (d: CommissionStatement["deals"][number]) => d.shares.map((s) => `${s.side === "seller" ? "Seller" : "Buyer"} · ${s.schemePercent}% × ${money(s.share)}`).join(" + ");
type Pay = { emp: string; deal?: string };

/**
 * M-07 9.15 (demo «المرتبات» ← العمولة): everyone with a 21103 account and what's owed, «كشف عمولة» per person and
 * «صرف عمولة سيلز» (on one fully collected deal against its TCR, or a TL's commission without a deal).
 */
export function Commissions() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = useCommissionPeople();
  const [open, setOpen] = useState<string | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [voucher, setVoucher] = useState<string | null>(null);
  const canPost = can("finance", "create");
  const due = (q.data ?? []).filter((p) => Number(p.balance) > 0);
  return (
    <Card title={t("commissions.title")} icon="trend" sub={t("commissions.sub")}
      extra={canPost && due.length > 0 && <button className="btn" onClick={() => setPay({ emp: due[0]!.employeeId })}><Icon name="wallet" />{t("kind.commission")}</button>}>
      {!q.data ? <Empty text={t("common.loading")} icon="clock" /> : (
        <Table head={[t("commissions.sales"), t("common.account"), t("commissions.due"), ""]} empty={t("commissions.empty")}
          rows={q.data.map((p) => [
            <a key="n" className="click" onClick={() => setOpen(p.employeeId)}><b>{p.name}</b></a>, <span key="c" className="mono">{p.code}</span>,
            <a key="b" className="click" onClick={() => setOpen(p.employeeId)}>{Number(p.balance) ? money(p.balance) : "—"}</a>,
            canPost && Number(p.balance) > 0 ? <button key="p" className="btn sm" onClick={() => setPay({ emp: p.employeeId })}>{t("commissions.pay")}</button> : "",
          ])} />
      )}
      <Note>{t("commissions.note")}</Note>
      {open && <Statement id={open} canPost={canPost} onPay={(p) => { setOpen(null); setPay(p); }} onVoucher={setVoucher} onClose={() => setOpen(null)} />}
      {pay && q.data && <PayoutForm people={due} start={pay} onClose={() => setPay(null)} onSaved={(id) => { setPay(null); setVoucher(id); }} />}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </Card>
  );
}

/** «كشف عمولة» (demo commStatement): each deal with his part and state, what was paid, and the vouchers. */
function Statement({ id, canPost, onPay, onVoucher, onClose }: { id: string; canPost: boolean; onPay: (p: Pay) => void; onVoucher: (id: string) => void; onClose: () => void }) {
  const t = useTranslations("finance");
  const s = useCommission(id).data;
  if (!s) return null;
  return (
    <Modal title={t("commissions.statementTitle", { name: s.employee.name })} onClose={onClose}>
      <div className="pdf">
        <Note><b>{t("commissions.dueNow", { amount: money(s.balance) })}</b><br />{t("commissions.formula")}</Note>
        {s.deals.length > 0 && <Table head={[t("commissions.deal"), t("commissions.client"), t("commissions.rate"), t("commissions.state"), t("commissions.commission"), t("commissions.paid"), ""]}
          rows={s.deals.map((d) => [<span key="c" className="mono">{d.code}</span>, d.company, rate(d), <Chip key="s" tone={tone(d.state)} plain>{serverText(d.state)}</Chip>, money(d.commission),
            Number(d.paid) ? money(d.paid) : "—", canPost && Number(d.due) > 0 ? <button key="p" className="btn sm" onClick={() => onPay({ emp: id, deal: d.dealId })}>{t("commissions.payAmount", { amount: money(d.due) })}</button> : ""])} />}
        {Number(s.tlDue) > 0 && <Note kind="ok">{t("commissions.tlLead")} <b>{money(s.tlDue)}</b> {t("commissions.tlDue")}
          {canPost && <> · <button className="btn sm" onClick={() => onPay({ emp: id })}>{t("commissions.payAmount", { amount: money(s.tlDue) })}</button></>}</Note>}
        {s.payouts.length > 0 && <>
          <h4 className="mini-h">{t("commissions.paidOut")}</h4>
          <Table head={[t("commissions.voucher"), t("common.date"), t("commissions.deal"), t("commissions.tcr"), t("common.amount")]} onRow={(i) => onVoucher(s.payouts[i]!.moveId)}
            rows={s.payouts.map((p) => [<span key="m" className="mono">{p.move}</span>, p.date, <span key="d" className="mono">{p.deal ?? "—"}</span>, <span key="t" className="mono">{p.tcr ?? "—"}</span>, money(p.amount)])} />
        </>}
      </div>
    </Modal>
  );
}

/** إذن «صرف عمولة سيلز» (demo mvNew commission): the person, the deal (or the TL's commission), its TCR, the safe and the amount. */
function PayoutForm({ people, start, onClose, onSaved }: { people: CommissionPerson[]; start: Pay; onClose: () => void; onSaved: (moveId: string) => void }) {
  const t = useTranslations("finance");
  const run = useAction();
  const refresh = useRefreshFinance();
  const cash = useCash().data;
  const [emp, setEmp] = useState(start.emp);
  const [dealId, setDealId] = useState(start.deal);
  const [busy, setBusy] = useState(false);
  const s = useCommission(emp).data;
  const deals = s?.deals.filter((d) => Number(d.due) > 0) ?? [];
  const deal = deals.find((d) => d.dealId === dealId) ?? deals[0];
  const tl = !!s && !deal && Number(s.tlDue) > 0;
  const due = deal ? deal.due : tl ? s.tlDue : null;
  const submit = onFormSubmit(async (d) => {
    const body: Record<string, string> = { employeeId: emp };
    for (const [k, v] of d.entries()) if (typeof v === "string" && v.trim()) body[k] = v.trim();
    setBusy(true);
    await run(async () => {
      const r = await api.post<CommissionPaid>("/finance/commissions/payouts", body);
      await refresh();
      onSaved(r.moveId);
    }, t("commissions.saved"));
    setBusy(false);
  });
  return (
    <Modal title={t("kind.commission")} onClose={onClose}>
      {!s || !cash ? <Empty text={t("common.loading")} icon="clock" /> : (
        <form className="grid" onSubmit={submit} key={`${emp}:${deal?.dealId ?? ""}`}>
          <Field label={t("common.fromSafe")} req><select name="fromId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {serverText(a.name)} · {money(a.balance)}</option>)}</select></Field>
          <Field label={tl ? t("commissions.salesOrTl") : t("commissions.sales")} req>
            <select value={emp} onChange={(e) => { setEmp(e.target.value); setDealId(undefined); }}>{people.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.name} · {t("commissions.owed", { amount: money(p.balance) })}</option>)}</select>
          </Field>
          {deal ? <>
            <Field label={t("commissions.dealToPay")} req wide>
              <select name="dealId" value={deal.dealId} onChange={(e) => setDealId(e.target.value)}>{deals.map((d) => <option key={d.dealId} value={d.dealId}>{d.code} · {d.company} · {t("commissions.owed", { amount: money(d.due) })}</option>)}</select>
            </Field>
            <dl className="kv wide card flat">{([[t("commissions.client"), deal.company], [t("commissions.unit"), deal.unitCode], [t("commissions.placesCommission"), money(deal.placesCommission)], [t("commissions.share"), <>{rate(deal)} = <b>{money(deal.commission)}</b></>], [t("commissions.paidOfIt"), money(deal.paid)]] as [string, ReactNode][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <Field label={t("commissions.tcrToSign")} wide>
              <select name="tcrId" defaultValue={deal.tcrs[0]?.id ?? ""}>{deal.tcrs.map((x) => <option key={x.id} value={x.id}>{x.code} · {money(x.amount)} · {x.side === "owner" ? t("commissions.fromOwner") : t("commissions.fromClient")} · {x.signed ? t("commissions.signed") : t("commissions.unsigned")}</option>)}<option value="">{t("commissions.noTcr")}</option></select>
            </Field>
          </> : tl ? <Note>{t("commissions.tlNote")} <b>{money(s.tlDue)}</b></Note>
            : <Note kind="warn">{t("commissions.nothingDue")}</Note>}
          {due && <>
            <Field label={t("common.amount")} req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required defaultValue={due} /></Field>
            <Field label={t("common.payDate")} req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>
            <Field label={t("common.memo")} wide><input name="memo" placeholder={t("common.optional")} /></Field>
          </>}
          <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>{due && <button className="btn" disabled={busy}><Icon name="check" />{busy ? t("common.saving") : t("common.record")}</button>}</div>
        </form>
      )}
    </Modal>
  );
}
