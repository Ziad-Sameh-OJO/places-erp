"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { InstallmentRow } from "@places/contracts";
import { Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { useFields, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import { INSTALLMENT_TONE, openContractFile, statusChip, useContract, useRefreshContracts } from "./use-contracts";
import { ContractActions } from "./contract-actions";

/** The demo's contract drawer (clients.js ctDrawer): the renewal note, the details, then the installment table. */
export function ContractDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("contracts");
  const q = useContract(id);
  const run = useAction();
  const { can } = useMe();
  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const fields = useFields("contracts"); // M-09: hidden rows and columns are gone; read-only ones can't be changed
  const c = q.data;
  if (!c) return <Drawer title={q.error ? t("drawer.notFound") : t("loading")} onClose={onClose}><Empty text={q.error?.message ?? t("loading")} icon="clock" /></Drawer>;
  const [tone, label] = statusChip(c, t("endingSoon"));
  const kv = ([
    ["client", t("fields.client"), c.client], ["unitCode", t("fields.unit"), <span key="u" className="mono">{c.unitCode}</span>], ["dealCode", t("fields.deal"), <span key="d" className="mono">{c.dealCode}</span>],
    ["startsOn", t("fields.starts"), day(c.startsOn)], ["endsOn", t("fields.ends"), day(c.endsOn)], ["value", t("fields.value"), money(c.value)], ["escalation", t("drawer.escalation"), `${c.escalation}%`],
    ["nextYearValue", t("drawer.nextYear"), money(c.nextYearValue)],
    ["file", t("drawer.file"), c.file ? <button key="f" type="button" className="btn ghost sm" onClick={() => void run(() => openContractFile(c.id))}><Icon name="file" />{c.file.name}</button> : "—"],
  ] satisfies [string, string, React.ReactNode][]).filter(([k]) => fields.shows(k)).map(([, k, v]) => [k, v] as const);
  const paidShown = fields.shows("paid");
  return (
    <Drawer title={t("drawer.title", { code: c.code })} sub={`${c.client} · ${c.unitCode}`} chips={<Chip tone={tone}>{label}</Chip>} onClose={onClose}>
      {c.endReason && <Note kind="warn"><b>{t("drawer.terminatedOn", { date: day(c.endedOn) })}</b> {c.endReason}{fields.shows("penalty") && c.penalty && Number(c.penalty) > 0 ? t("drawer.penalty", { amount: money(c.penalty) }) : ""}{t("drawer.unitBack")}</Note>}
      {c.status === "Ended" && <Note>{t("drawer.ended", { date: day(c.endedOn) })}</Note>}
      {c.endingSoon && <Note kind="warn">{t.rich("drawer.endingSoon", { days: String(c.daysLeft), count: c.daysLeft, b: (ch) => <b>{ch}</b> })}</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {fields.shows("installments") && <section className="card flat">
        <div className="card-head"><h3><span className="ico"><Icon name="calendar" /></span><span>{t("drawer.installments")}</span></h3></div>
        <Table head={[t("drawer.due"), t("fields.amount"), ...(paidShown ? [t("drawer.paid")] : []), t("fields.status"), ""]} rows={c.installments.map((i) => [
          day(i.dueOn), <span key="a" className="n">{money(i.amount)}</span>, ...(paidShown ? [<span key="p" className="n">{money(i.paid)}</span>] : []),
          <Chip key="s" tone={INSTALLMENT_TONE[i.state]}>{t(`installment.${i.state}`)}</Chip>,
          <div key="x" className="row">
            {i.payments.map((p) => <a key={p.id} className="btn ghost sm" href={`/api/v1/contracts/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" title={`${money(p.amount)} · ${day(p.paidOn)}`}><Icon name="file" />{t("receipt", { no: p.receiptNo })}</a>)}
            {i.state !== "paid" && can("contracts", "edit") && fields.edits("paid") && <button type="button" className="btn sm" onClick={() => setPaying(i)}>{t("drawer.pay")}</button>}
          </div>,
        ])} />
      </section>}
      {paying && <PayForm i={paying} onClose={() => setPaying(null)} />}
      <ContractActions c={c} />
    </Drawer>
  );
}

/** «سجّل دفعة» (M-11 2.1 step 4): the rest of the installment by default; part of it leaves it «جزء» (2.3). */
function PayForm({ i, onClose }: { i: InstallmentRow; onClose: () => void }) {
  const t = useTranslations("contracts.pay");
  const run = useAction();
  const refresh = useRefreshContracts();
  const left = ((Math.round(Number(i.amount) * 100) - Math.round(Number(i.paid) * 100)) / 100).toFixed(2);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const send = (d: FormData) => run(async () => {
    await api.post(`/contracts/installments/${i.id}/payments`, { amount: String(d.get("amount") ?? "").trim(), paidOn: String(d.get("paidOn") ?? today) });
    await refresh();
    onClose();
  }, t("saved"));
  return (
    <Modal title={t("title", { date: day(i.dueOn) })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(send)}>
        <Field label={t("amountLeft", { left: money(left) })} req><input name="amount" inputMode="decimal" defaultValue={left} required /></Field>
        <Field label={t("paidOn")} req><input name="paidOn" type="date" defaultValue={today} max={today} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button><button className="btn">{t("submit")}</button></div>
      </form>
    </Modal>
  );
}
