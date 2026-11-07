"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CustodyBox, PurchaseView, StoredFile } from "@places/contracts";
import { fromDecimal, toDecimal } from "@places/domain";
import { Chip, Empty, Field, Icon, Note, onFormSubmit, useAction, useToast } from "@/components/ui";
import { Drawer, Stepper } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, day, money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { STATUS, openFile, usePurchase, useRefreshProcurement } from "./use-purchases";
import { Attachments } from "./purchase-form";

/** Each status's place on the stepper (Pending · Approved · settled · posted). */
const STAGE: Record<PurchaseView["status"], number> = { Pending: 0, Rejected: 0, Approved: 1, Settled: 2, Posted: 3 };

/** The demo's request drawer: the stepper, the budget warning, the details, then the approver's or the buyer's form. */
export function PurchaseDrawer({ id, cash, onClose }: { id: string; cash: CustodyBox[]; onClose: () => void }) {
  const t = useTranslations("procurement");
  const { can } = useMe();
  const q = usePurchase(id);
  const run = useAction();
  const p = q.data;
  if (!p) return <Drawer title={q.error ? t("drawer.notFound") : t("common.loading")} onClose={onClose}><Empty text={q.error?.message ?? t("common.loading")} icon="clock" /></Drawer>;
  const stages = ["Pending", "Approved", t("drawer.stageSettled"), t("drawer.stagePosted")];
  const left = p.budgetLeft === null ? null : fromDecimal(p.budgetLeft) - (p.status === "Posted" ? 0 : fromDecimal(p.amount));
  const kv: [string, React.ReactNode][] = [
    [t("form.item"), p.item], [t("common.amount"), money(p.amount)], [t("common.line"), `${p.account.code} · ${serverText(p.account.name)}`], [t("common.vendor"), p.vendor ?? "—"],
    [t("drawer.attachments"), p.attachments.length ? <span key="f">{p.attachments.map((f) => <button key={f.id} type="button" className="btn ghost sm" onClick={() => void run(() => openFile(p.id, f.id))}><Icon name="file" />{f.name}</button>)}</span> : "—"],
    [t("drawer.approver"), p.decidedBy ?? "—"], [t("drawer.paidFrom"), p.paidFrom ? serverText(p.paidFrom.name) : "—"], [t("drawer.requested"), `${ago(p.createdAt)} · ${p.createdBy.name}`],
    ...(left !== null ? [[t("drawer.budgetAfter"), money(toDecimal(left))] as [string, string]] : []),
  ];
  return (
    <Drawer title={p.item} sub={t("drawer.sub", { no: p.no })} chips={<Chip tone={STATUS[p.status]}>{t(`status.${p.status}`)}</Chip>} onClose={onClose}>
      <Stepper stages={stages} current={stages[STAGE[p.status]]!} done={p.status === "Posted"} />
      {p.overBudget && <Note kind="warn"><b>{t("drawer.warning")}</b> {t("drawer.overBudget", { line: serverText(p.account.name), left: money(p.budgetLeft) })}</Note>}
      {p.status === "Pending" && Number(p.amount) > 50_000 && <Note>{t("drawer.bigAmount")}</Note>}
      {p.rejectReason && <Note kind="warn">{t("drawer.rejectReason", { reason: p.rejectReason })}</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {can("procurement", "approve") && p.status === "Pending" && (p.blocker ? <Note kind="warn">{serverText(p.blocker)}</Note> : <Decide p={p} />)}
      {can("procurement", "edit") && p.status === "Approved" && <Settle p={p} cash={cash} />}
      {p.status === "Settled" && <Note kind="warn">{t("drawer.settledOn", { day: day(p.settledAt) })}</Note>}
      {p.status === "Posted" && <Note kind="ok">{t("drawer.postedOn", { no: p.move?.no ?? "", day: day(p.postedAt) })}</Note>}
    </Drawer>
  );
}

/** «قرارك»: رفض (بالسبب) أو موافقة. */
function Decide({ p }: { p: PurchaseView }) {
  const t = useTranslations("procurement");
  const run = useAction();
  const refresh = useRefreshProcurement();
  const [reason, setReason] = useState("");
  const send = (decision: "Approved" | "Rejected") => void run(async () => {
    await api.post(`/procurement/purchases/${p.id}/decision`, { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    await refresh();
  }, decision === "Approved" ? t("decide.approved") : t("decide.rejected"));
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="check" /></span><span>{t("decide.title")}</span></h3></div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("decide.reasonPlaceholder")} aria-label={t("decide.reason")} maxLength={300} />
      <div className="row end">
        <button type="button" className="btn danger" onClick={() => send("Rejected")}>{t("decide.reject")}</button>
        <button type="button" className="btn" onClick={() => send("Approved")}>{t("decide.approve")}</button>
      </div>
    </section>
  );
}

/** «التسوية»: which safe it was paid from (a suggestion for finance) and the amount when paying; balances don't move here. */
function Settle({ p, cash }: { p: PurchaseView; cash: CustodyBox[] }) {
  const t = useTranslations("procurement");
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshProcurement();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const mine = cash.find((c) => /مختار/.test(c.name))?.accountId ?? ""; // the demo preselects Mokhtar's own safe (matched by its stored name)
  const send = (d: FormData) => void run(async () => {
    const r = await api.post<PurchaseView>(`/procurement/purchases/${p.id}/settle`, { paidFromId: String(d.get("paidFromId") ?? ""), amount: String(d.get("amount") ?? "").trim(), attachments: files.map((f) => f.id) });
    await refresh();
    toast(r.status === "Pending" ? t("settle.backToApproval") : t("settle.sent"));
  });
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="wallet" /></span><span>{t("settle.title")}<small>{t("settle.sub")}</small></span></h3></div>
      <Field label={t("settle.paidFrom")} req>
        <select name="paidFromId" required defaultValue={mine}>{cash.map((c) => <option key={c.accountId} value={c.accountId}>{serverText(c.name)}</option>)}</select>
      </Field>
      <Field label={t("settle.amount")}><input name="amount" required inputMode="decimal" type="number" min={1} step="0.01" defaultValue={Number(p.amount)} /></Field>
      <Field label={t("settle.moreFiles")} wide><Attachments files={files} onAdd={(f) => setFiles((x) => [...x, f])} /></Field>
      <div className="row end wide"><button className="btn">{t("settle.submit")}</button></div>
    </form>
  );
}
