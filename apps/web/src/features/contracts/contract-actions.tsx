"use client";
import { useTranslations } from "next-intl";
import type { ContractDetail } from "@places/contracts";
import { Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, money } from "@/lib/format";
import { useRefreshContracts } from "./use-contracts";

/** 6.4 in the contract drawer: a value change (asked → management decides) and «فسخ العقد» (reason · penalty). */
export function ContractActions({ c }: { c: ContractDetail }) {
  const { can } = useMe();
  if (c.status !== "Active") return null;
  return (
    <>
      {c.pending ? <PendingValue c={c} decide={can("contracts", "approve") && !c.pending.mine} />
        : can("contracts", "create") && <ProposeValue c={c} />}
      {can("contracts", "approve") && <Terminate c={c} />}
    </>
  );
}

function PendingValue({ c, decide }: { c: ContractDetail; decide: boolean }) {
  const t = useTranslations("contracts.actions");
  const run = useAction();
  const refresh = useRefreshContracts();
  const p = c.pending!;
  const send = (decision: "approve" | "reject") => void run(async () => {
    await api.post(`/contracts/${c.id}/value/decision`, { decision });
    await refresh();
  }, decision === "approve" ? t("valueChanged") : t("requestRejected"));
  return (
    <Note kind="warn">
      <b>{t("pendingTitle")}</b> {money(c.value)} {t("arrow")} {money(p.value)} · {p.reason}{p.by ? ` · ${p.by}` : ""} · {ago(p.at)}
      {decide ? <span className="row end"><button type="button" className="btn ghost sm" onClick={() => send("reject")}>{t("reject")}</button><button type="button" className="btn sm" onClick={() => send("approve")}>{t("approve")}</button></span>
        : <span className="sub">{t("waiting")}</span>}
    </Note>
  );
}

function ProposeValue({ c }: { c: ContractDetail }) {
  const t = useTranslations("contracts.actions");
  const run = useAction();
  const refresh = useRefreshContracts();
  const send = (d: FormData) => void run(async () => {
    await api.post(`/contracts/${c.id}/value`, { value: String(d.get("value") ?? "").trim(), reason: String(d.get("reason") ?? "") });
    await refresh();
  }, t("sentForApproval"));
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="wallet" /></span><span>{t("changeTitle")}<small>{t("changeSub")}</small></span></h3></div>
      <Field label={t("newValue")} req><input name="value" required inputMode="decimal" type="number" min={1} step="0.01" defaultValue={Number(c.value)} /></Field>
      <Field label={t("reason")} req><input name="reason" required minLength={2} maxLength={500} /></Field>
      <div className="row end wide"><button className="btn ghost sm">{t("sendForApproval")}</button></div>
    </form>
  );
}

function Terminate({ c }: { c: ContractDetail }) {
  const t = useTranslations("contracts.actions");
  const run = useAction();
  const refresh = useRefreshContracts();
  const send = (d: FormData) => void run(async () => {
    await api.post(`/contracts/${c.id}/terminate`, { reason: String(d.get("reason") ?? ""), penalty: String(d.get("penalty") || "0") });
    await refresh();
  }, t("terminated"));
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="x" /></span><span>{t("terminate")}</span></h3></div>
      <Field label={t("reason")} req><input name="reason" required minLength={2} maxLength={500} placeholder={t("terminateReason")} /></Field>
      <Field label={t("penalty")}><input name="penalty" inputMode="decimal" type="number" min={0} step="0.01" defaultValue={0} /></Field>
      <div className="row end wide"><button className="btn danger sm">{t("terminate")}</button></div>
    </form>
  );
}
