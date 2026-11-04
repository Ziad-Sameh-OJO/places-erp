"use client";
import { useState } from "react";
import type { CustodyBox, PurchaseView, StoredFile } from "@places/contracts";
import { fromDecimal, toDecimal } from "@places/domain";
import { Chip, Empty, Field, Icon, Note, onFormSubmit, useAction, useToast } from "@/components/ui";
import { Drawer, Stepper } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, day, money } from "@/lib/format";
import { STATUS, openFile, usePurchase, useRefreshProcurement } from "./use-purchases";
import { Attachments } from "./purchase-form";

const STAGES = ["Pending", "Approved", "اتسوّى", "اترحّل في المالية"] as const;
const STAGE: Record<string, string> = { Pending: "Pending", Rejected: "Pending", Approved: "Approved", Settled: "اتسوّى", Posted: "اترحّل في المالية" };

/** The demo's request drawer: the stepper, the budget warning, the details, then the approver's or the buyer's form. */
export function PurchaseDrawer({ id, cash, onClose }: { id: string; cash: CustodyBox[]; onClose: () => void }) {
  const { can } = useMe();
  const q = usePurchase(id);
  const run = useAction();
  const p = q.data;
  if (!p) return <Drawer title={q.error ? "الطلب مش موجود" : "بيحمّل…"} onClose={onClose}><Empty text={q.error?.message ?? "بيحمّل…"} icon="clock" /></Drawer>;
  const left = p.budgetLeft === null ? null : fromDecimal(p.budgetLeft) - (p.status === "Posted" ? 0 : fromDecimal(p.amount));
  const kv: [string, React.ReactNode][] = [
    ["الحاجة", p.item], ["المبلغ", money(p.amount)], ["البند", `${p.account.code} · ${p.account.name}`], ["المورد", p.vendor ?? "—"],
    ["المرفقات", p.attachments.length ? <span key="f">{p.attachments.map((f) => <button key={f.id} type="button" className="btn ghost sm" onClick={() => void run(() => openFile(p.id, f.id))}><Icon name="file" />{f.name}</button>)}</span> : "—"],
    ["المعتمد", p.decidedBy ?? "—"], ["اتصرف من", p.paidFrom?.name ?? "—"], ["اتطلب", `${ago(p.createdAt)} · ${p.createdBy.name}`],
    ...(left !== null ? [["الـ Budget بعد الصرف", money(toDecimal(left))] as [string, string]] : []),
  ];
  return (
    <Drawer title={p.item} sub={`${p.no} · طلب شراء`} chips={<Chip tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Chip>} onClose={onClose}>
      <Stepper stages={STAGES} current={STAGE[p.status]!} done={p.status === "Posted"} />
      {p.overBudget && <Note kind="warn"><b>تنبيه:</b> الطلب ده هيعدّي الـ Budget الفاضل في بند {p.account.name} (فاضل {money(p.budgetLeft)}). مايتصرفش غير بموافقة الإدارة.</Note>}
      {p.status === "Pending" && Number(p.amount) > 50_000 && <Note>المبلغ أكتر من 50,000 ج.م: الموافقة لأحمد أو صفوت بس.</Note>}
      {p.rejectReason && <Note kind="warn">سبب الرفض: {p.rejectReason}</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {can("procurement", "approve") && p.status === "Pending" && (p.blocker ? <Note kind="warn">{p.blocker}</Note> : <Decide p={p} />)}
      {can("procurement", "edit") && p.status === "Approved" && <Settle p={p} cash={cash} />}
      {p.status === "Settled" && <Note kind="warn">اتسوّى يوم {day(p.settledAt)} · مستني المالية تصرفه من الخزنة وتعمل القيد</Note>}
      {p.status === "Posted" && <Note kind="ok">المالية رحّلته · {p.move?.no} يوم {day(p.postedAt)}</Note>}
    </Drawer>
  );
}

/** «قرارك»: رفض (بالسبب) أو موافقة. */
function Decide({ p }: { p: PurchaseView }) {
  const run = useAction();
  const refresh = useRefreshProcurement();
  const [reason, setReason] = useState("");
  const send = (decision: "Approved" | "Rejected") => void run(async () => {
    await api.post(`/procurement/purchases/${p.id}/decision`, { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    await refresh();
  }, decision === "Approved" ? "اتوافق · مختار يقدر يصرف" : "اترفض ورجع لمختار بالسبب");
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="check" /></span><span>قرارك</span></h3></div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الرفض (لو هترفض)" aria-label="سبب الرفض" maxLength={300} />
      <div className="row end">
        <button type="button" className="btn danger" onClick={() => send("Rejected")}>رفض</button>
        <button type="button" className="btn" onClick={() => send("Approved")}>موافقة</button>
      </div>
    </section>
  );
}

/** «التسوية»: which safe it was paid from (a suggestion for finance) and the amount when paying; balances don't move here. */
function Settle({ p, cash }: { p: PurchaseView; cash: CustodyBox[] }) {
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshProcurement();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const mine = cash.find((c) => /مختار/.test(c.name))?.accountId ?? ""; // the demo preselects Mokhtar's own safe
  const send = (d: FormData) => void run(async () => {
    const r = await api.post<PurchaseView>(`/procurement/purchases/${p.id}/settle`, { paidFromId: String(d.get("paidFromId") ?? ""), amount: String(d.get("amount") ?? "").trim(), attachments: files.map((f) => f.id) });
    await refresh();
    toast(r.status === "Pending" ? "المبلغ اتغير · الطلب رجع للموافقة تاني" : "اتبعت للمالية · الأرصدة مااتغيرتش");
  });
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="wallet" /></span><span>التسوية<small>المشتريات بتبلّغ المالية بس · الأرصدة والقيد بيعملهم المحاسب</small></span></h3></div>
      <Field label="اتدفع من (معلومة للمالية)" req>
        <select name="paidFromId" required defaultValue={mine}>{cash.map((c) => <option key={c.accountId} value={c.accountId}>{c.name}</option>)}</select>
      </Field>
      <Field label="المبلغ وقت الدفع"><input name="amount" required inputMode="decimal" type="number" min={1} step="0.01" defaultValue={Number(p.amount)} /></Field>
      <Field label="مرفقات تانية (الإيصال)" wide><Attachments files={files} onAdd={(f) => setFiles((x) => [...x, f])} /></Field>
      <div className="row end wide"><button className="btn">اتسوّى · ابعته للمالية</button></div>
    </form>
  );
}
