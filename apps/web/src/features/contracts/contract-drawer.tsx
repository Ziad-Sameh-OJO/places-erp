"use client";
import { useState } from "react";
import type { InstallmentRow } from "@places/contracts";
import { Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import { INSTALLMENT, openContractFile, statusChip, useContract, useRefreshContracts } from "./use-contracts";

/** The demo's contract drawer (clients.js ctDrawer): the renewal note, the details, then the installment table. */
export function ContractDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useContract(id);
  const run = useAction();
  const { can } = useMe();
  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const c = q.data;
  if (!c) return <Drawer title={q.error ? "العقد مش موجود" : "بيحمّل…"} onClose={onClose}><Empty text={q.error?.message ?? "بيحمّل…"} icon="clock" /></Drawer>;
  const [tone, label] = statusChip(c);
  const kv: [string, React.ReactNode][] = [
    ["العميل", c.client], ["الوحدة", <span key="u" className="mono">{c.unitCode}</span>], ["الصفقة", <span key="d" className="mono">{c.dealCode}</span>],
    ["البداية", day(c.startsOn)], ["النهاية", day(c.endsOn)], ["القيمة", money(c.value)], ["الزيادة السنوية", `${c.escalation}%`],
    ["قيمة السنة الجاية", money(c.nextYearValue)],
    ["ملف العقد", c.file ? <button key="f" type="button" className="btn ghost sm" onClick={() => void run(() => openContractFile(c.id))}><Icon name="file" />{c.file.name}</button> : "—"],
  ];
  return (
    <Drawer title={`عقد ${c.code}`} sub={`${c.client} · ${c.unitCode}`} chips={<Chip tone={tone}>{label}</Chip>} onClose={onClose}>
      {c.endingSoon && <Note kind="warn">العقد بينتهي بعد <b>{c.daysLeft}</b> يوم. التنبيهات بتتبعت 90 و60 و30 يوم قبل النهاية.</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <section className="card flat">
        <div className="card-head"><h3><span className="ico"><Icon name="calendar" /></span><span>جدول الأقساط</span></h3></div>
        <Table head={["الميعاد", "المبلغ", "المدفوع", "الحالة", ""]} rows={c.installments.map((i) => [
          day(i.dueOn), <span key="a" className="n">{money(i.amount)}</span>, <span key="p" className="n">{money(i.paid)}</span>,
          <Chip key="s" tone={INSTALLMENT[i.state][0]}>{INSTALLMENT[i.state][1]}</Chip>,
          <div key="x" className="row">
            {i.payments.map((p) => <a key={p.id} className="btn ghost sm" href={`/api/v1/contracts/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" title={`${money(p.amount)} · ${day(p.paidOn)}`}><Icon name="file" />إيصال {p.receiptNo}</a>)}
            {i.state !== "paid" && can("contracts", "edit") && <button type="button" className="btn sm" onClick={() => setPaying(i)}>سجّل دفعة</button>}
          </div>,
        ])} />
      </section>
      {paying && <PayForm i={paying} onClose={() => setPaying(null)} />}
    </Drawer>
  );
}

/** «سجّل دفعة» (M-11 2.1 step 4): the rest of the installment by default; part of it leaves it «جزء» (2.3). */
function PayForm({ i, onClose }: { i: InstallmentRow; onClose: () => void }) {
  const run = useAction();
  const refresh = useRefreshContracts();
  const left = ((Math.round(Number(i.amount) * 100) - Math.round(Number(i.paid) * 100)) / 100).toFixed(2);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const send = (d: FormData) => run(async () => {
    await api.post(`/contracts/installments/${i.id}/payments`, { amount: String(d.get("amount") ?? "").trim(), paidOn: String(d.get("paidOn") ?? today) });
    await refresh();
    onClose();
  }, "الدفعة اتسجّلت على العقد");
  return (
    <Modal title={`سجّل دفعة · قسط ${day(i.dueOn)}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(send)}>
        <Field label={`المبلغ (الباقي ${money(left)})`} req><input name="amount" inputMode="decimal" defaultValue={left} required /></Field>
        <Field label="تاريخ الدفع" req><input name="paidOn" type="date" defaultValue={today} max={today} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn">سجّل الدفعة</button></div>
      </form>
    </Modal>
  );
}
