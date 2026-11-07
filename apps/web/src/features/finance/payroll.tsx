"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PayrollRowView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useCash, usePayroll, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";
import { LedgerModal } from "./ledger-modal";
import { Commissions } from "./commissions";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * M-07 · «المرتبات» (9.14 + 9.3's advance deduction; demo payroll() / payRunNew): everyone at once — salary −
 * attendance deduction − the advance deduction the accountant chose = net — as one voucher with one entry.
 */
export function Payroll() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = usePayroll(), cash = useCash();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [paying, setPaying] = useState(false);
  const [voucher, setVoucher] = useState<string | null>(null);
  const [ledger, setLedger] = useState<string | null>(null);
  if (!q.data || !cash.data) return <Empty text={t("common.loading")} icon="clock" />;
  const p = q.data, canPost = can("finance", "create"), canEdit = can("finance", "edit");
  const label = serverText(p.label);
  const people = { count: p.totals.people, n: String(p.totals.people) };
  const plan = (r: PayrollRowView, v: string) => run(async () => { await api.put(`/finance/payroll/advances/${r.userId}`, { amount: v || "0" }); await refresh(); }, t("payroll.planned", { name: r.name, amount: money(v || "0") }));
  const pay = onFormSubmit(async (d) => run(async () => {
    const r = await api.post<{ move: { id: string } }>("/finance/payroll/run", { fromId: d.get("fromId"), date: d.get("date") });
    await refresh(); setPaying(false); setVoucher(r.move.id);
  }, t("payroll.paid")));
  return (
    <>
      {p.run ? (
        <Note kind="ok"><b>{t("payroll.paidTitle", { label })}</b> · {p.run.at.slice(0, 10)} · {t("payroll.paidFrom", { amount: money(p.run.net), from: serverText(p.run.from) })} · <a className="mono click" onClick={() => setVoucher(p.run!.move.id)}>{p.run.move.no}</a></Note>
      ) : (
        <Card title={t("payroll.notPaidTitle", { label })} icon="wallet" className="attn" sub={t("payroll.notPaidSub")}
          extra={<Chip tone={p.due ? "warn" : ""}>{p.due ? t("payroll.dueNow") : t("payroll.dueOn", { day: String(p.payDay) })}</Chip>}>
          <div className="row">
            {canPost && p.rows.length > 0 && <button className="btn" onClick={() => setPaying(true)}><Icon name="wallet" />{t("payroll.payAll", { amount: money(p.totals.net) })}</button>}
            <span className="spacer" />
            <label className="row hint">{t("payroll.payDayLead")}
              <input type="number" min={1} max={28} defaultValue={p.payDay} disabled={!canEdit} style={{ maxWidth: 70 }} aria-label={t("payroll.payDay")}
                onBlur={(e) => { const v = Number(e.target.value); if (v !== p.payDay && v >= 1 && v <= 28) void run(async () => { await api.patch("/finance/payroll/day", { day: v }); await refresh(); }, t("common.saved")); }} /> {t("payroll.payDayTail")}</label>
          </div>
        </Card>
      )}
      <div className="kpis">
        <KpiTile label={t("payroll.salaries")} value={money(p.totals.salary)} sub={t("payroll.salariesSub", people)} icon="id" />
        <KpiTile label={t("payroll.attendance")} value={money(p.totals.attendance)} sub={t("payroll.attendanceSub")} icon="clock" tone="bad" />
        <KpiTile label={t("payroll.advances")} value={money(p.totals.advance)} sub={t("payroll.advancesSub")} icon="users" />
        <KpiTile label={t("payroll.netTotal")} value={money(p.totals.net)} sub={t("payroll.netTotalSub")} icon="wallet" />
      </div>
      {!p.rows.length ? <Note kind="warn">{t("payroll.empty")}</Note> : (
        <Table head={[t("common.employee"), t("payroll.salary"), t("payroll.attendance"), t("payroll.owesAdvance"), t("payroll.advanceThisMonth"), t("payroll.net")]}
          rows={p.rows.map((r) => [
            <span key="n"><b>{r.name}</b><span className="sub">{r.line === "sales" ? t("payroll.lineSales") : t("payroll.lineAdmin")}</span></span>, money(r.salary),
            Number(r.attendance) ? `−${money(r.attendance)}` : "—",
            Number(r.advanceLeft) ? <a key="l" className="click" onClick={() => setLedger(r.advanceAccountId)}>{money(r.advanceLeft)}</a> : "—",
            Number(r.advanceLeft) && canPost && !p.run
              ? <input key={`a${r.advance}`} style={{ width: 100 }} inputMode="decimal" defaultValue={r.advance} aria-label={t("payroll.advanceOf", { name: r.name })}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.advance && /^\d+(\.\d{1,2})?$/.test(v)) void plan(r, v); }} />
              : Number(r.advance) ? `−${money(r.advance)}` : "—",
            <b key="net">{money(r.net)}</b>,
          ])} />
      )}
      <Note kind={p.deductionsApproved ? "ok" : "warn"}>{p.deductionsApproved ? t("payroll.deductionsApproved") : t("payroll.deductionsPending")}</Note>
      <Note>{t("payroll.commissionsNote")}</Note>
      <Commissions />
      {paying && (
        <Modal title={t("payroll.payTitle", { label })} onClose={() => setPaying(false)}>
          <form className="grid" onSubmit={pay}>
            <Note>{t("payroll.payNote")}</Note>
            <div className="wide"><Table head={[t("journal.total"), t("payroll.salary"), t("payroll.attendance"), t("payroll.advance"), t("payroll.netShort")]}
              rows={[[t("payroll.employees", people), money(p.totals.salary), money(p.totals.attendance), money(p.totals.advance), <b key="n">{money(p.totals.net)}</b>]]} /></div>
            <Field label={t("common.paidFrom")} req><select name="fromId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.data.accounts.map((a) => <option key={a.id} value={a.id}>{serverText(a.name)} · {money(a.balance)}</option>)}</select></Field>
            <Field label={t("common.payDate")} req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setPaying(false)}>{t("common.cancel")}</button><button className="btn"><Icon name="check" />{t("commissions.payAmount", { amount: money(p.totals.net) })}</button></div>
          </form>
        </Modal>
      )}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
