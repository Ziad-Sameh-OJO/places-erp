"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClaimView, ClaimsView } from "@places/contracts";
import { localDate } from "@places/domain";
import { Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { money } from "./money";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { NewClaim } from "@/components/new-claim";
import { useCash, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";

type Filter = "open" | "requested" | "approved" | "paid" | "all";
const FILTERS: readonly Filter[] = ["open", "requested", "approved", "paid", "all"];
const TONE: Record<ClaimView["status"], "warn" | "info" | "ok" | "bad"> = { requested: "warn", issued: "info", approved: "warn", einvoice: "info", paid: "ok", rejected: "bad" };
export const useClaims = (f: Filter = "open") => useQuery({ queryKey: ["finance", "claims", f], queryFn: () => api.get<ClaimsView>(`/claims?status=${f}`) });
/** what waits on the accountant: to issue, the e-invoice, a payment to record */
export const claimsWaiting = (v: ClaimsView | undefined) => v?.items.filter((c) => c.status === "requested" || c.status === "approved" || (c.receiptAsked && c.status !== "paid")).length ?? 0;
const pdf = (c: ClaimView, doc: "claim" | "receipt") => `/api/v1/claims/${c.id}/pdf?doc=${doc}`;

/** M-07 · «المطالبات» (9.17, demo claims.js `claimsTab`): the claim's whole way from the request to the cash receipt. */
export function Claims() {
  const t = useTranslations("finance");
  const { can, me } = useMe();
  const [f, setF] = useState<Filter>("open");
  const q = useClaims(f);
  const run = useAction();
  const refresh = useRefreshFinance();
  const [modal, setModal] = useState<{ kind: "new" | "reject" | "einvoice" | "collect"; c?: ClaimView } | null>(null);
  const [voucher, setVoucher] = useState<string | null>(null);
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const fin = can("finance", "approve"), post = can("finance", "create");
  const step = (c: ClaimView, path: string, ok: string, body?: unknown) => run(async () => { await api.post(`/claims/${c.id}/${path}`, body); await refresh(); setModal(null); }, ok);
  const act = (c: ClaimView) => {
    const mine = c.by.id === me?.id;
    return (
      <span className="row">
        {fin && c.status === "requested" && <><button className="btn sm" onClick={() => void step(c, "issue", t("claims.issued"))}>{t("claims.issue")}</button><button className="btn ghost sm" onClick={() => setModal({ kind: "reject", c })}>{t("claims.reject")}</button></>}
        {can("finance", "edit") && (c.status === "approved" || c.status === "issued") && <button className={`btn ${c.status === "approved" ? "" : "ghost"} sm`} onClick={() => setModal({ kind: "einvoice", c })}>{c.status === "approved" ? t("claims.einvoiceDone") : t("claims.einvoiceUpload")}</button>}
        {post && ["issued", "approved", "einvoice"].includes(c.status) && <button className={`btn ${c.receiptAsked ? "" : "ghost"} sm`} onClick={() => setModal({ kind: "collect", c })}>{t("claims.collect")}</button>}
        {mine && c.status === "issued" && <button className="btn sm" onClick={() => void step(c, "client-approved", t("claims.clientApprovedOk"))}>{t("claims.clientApproved")}</button>}
        {mine && ["issued", "approved", "einvoice"].includes(c.status) && !c.receiptAsked && <button className="btn ghost sm" onClick={() => void step(c, "ask-receipt", t("claims.askReceiptOk"))}>{t("claims.askReceipt")}</button>}
        {c.status === "paid" && <><a className="btn ghost sm" href={pdf(c, "receipt")} target="_blank" rel="noreferrer">{c.receiptNo}</a>{c.move && <a className="mono click" onClick={() => setVoucher(c.move!.id)}>{c.move.no}</a>}</>}
        {c.status === "rejected" && c.why}
      </span>
    );
  };
  return (
    <>
      <Note>{t("claims.note")}</Note>
      <div className="row">
        <div className="seg" role="group">{FILTERS.map((k) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{t(`claims.filter.${k}`)}</button>)}</div>
        <span className="spacer" />
        {can("master", "view") && <a className="btn ghost sm" href="/master"><Icon name="file" />{t("claims.templates")}</a>}
        {can("deals", "create") && <button className="btn sm" onClick={() => setModal({ kind: "new" })}><Icon name="plus" />{t("claims.request")}</button>}
      </div>
      <Table head={[t("claims.claim"), t("claims.company"), t("claims.unit"), t("common.amount"), t("claims.by"), t("claims.status"), ""]} empty={t("claims.empty")}
        rows={q.data.items.map((c) => [
          <span key="n">{c.status === "requested" || c.status === "rejected" ? <span className="mono">{c.no}</span> : <a className="mono click" href={pdf(c, "claim")} target="_blank" rel="noreferrer">{c.no}</a>}</span>,
          <span key="c">{c.company}<span className="sub">{t("claims.inNameOf", { name: c.entity.name })}</span></span>,
          <span key="u">{c.unit}<span className="sub">{c.unitInfo}</span></span>,
          <b key="a">{money(c.amount)}</b>,
          <span key="b">{c.by.name}<span className="sub">{day(c.at)}</span></span>,
          <span key="s"><Chip tone={TONE[c.status]}>{serverText(c.label)}</Chip>{c.einvoice && <span className="sub">{t("claims.invoiceNo", { no: c.einvoice.no })}</span>}{c.receiptAsked && c.status !== "paid" && <span className="sub">{t("claims.receiptAsked")}</span>}</span>,
          act(c),
        ])} />
      {modal?.kind === "new" && <NewClaim entities={q.data.entities} onClose={() => setModal(null)} />}
      {modal?.kind === "reject" && modal.c && (
        <Modal title={t("claims.rejectTitle", { no: modal.c.no })} onClose={() => setModal(null)}>
          <form className="grid" onSubmit={onFormSubmit((d) => step(modal.c!, "reject", t("claims.rejected"), { why: d.get("why") }))}>
            <Field label={t("claims.rejectWhy")} req wide><input name="why" required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("common.cancel")}</button><button className="btn">{t("claims.reject")}</button></div>
          </form>
        </Modal>
      )}
      {modal?.kind === "einvoice" && modal.c && (
        <Modal title={t("claims.einvoiceTitle", { no: modal.c.no })} onClose={() => setModal(null)}>
          <form className="grid" onSubmit={onFormSubmit((d) => step(modal.c!, "einvoice", t("claims.einvoiceSaved"), { no: d.get("no"), date: d.get("date") }))}>
            <Note>{modal.c.company} · {money(modal.c.amount)} · {t("claims.einvoiceNote")}</Note>
            <Field label={t("claims.einvoiceNo")} req><input name="no" required placeholder={t("claims.einvoicePlaceholder")} dir="ltr" /></Field>
            <Field label={t("claims.einvoiceDate")} req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("common.cancel")}</button><button className="btn"><Icon name="check" />{t("claims.uploaded")}</button></div>
          </form>
        </Modal>
      )}
      {modal?.kind === "collect" && modal.c && <Collect c={modal.c} incomes={q.data.incomes} onSave={(body) => step(modal.c!, "collect", t("claims.collected"), body)} onClose={() => setModal(null)} />}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </>
  );
}

/** «اتحصّلت · اعمل الإيصال»: the receive voucher's two sides; the amount and the party are the claim's. */
function Collect({ c, incomes, onSave, onClose }: { c: ClaimView; incomes: ClaimsView["incomes"]; onSave: (b: unknown) => void; onClose: () => void }) {
  const t = useTranslations("finance");
  const cash = useCash().data;
  return (
    <Modal title={t("claims.collectTitle", { no: c.no })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => onSave({ toId: d.get("toId"), accountId: d.get("accountId"), date: d.get("date") }))}>
        <Note>{c.company} · <b>{money(c.amount)}</b> · {serverText(c.kind)} · {t("claims.collectNote")}</Note>
        <Field label={t("claims.collectedIn")} req><select name="toId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash?.accounts.map((a) => <option key={a.id} value={a.id}>{serverText(a.name)}</option>)}</select></Field>
        <Field label={t("claims.incomeLine")} req><select name="accountId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{incomes.map((a) => <option key={a.id} value={a.id}>{a.code} · {serverText(a.name)}</option>)}</select></Field>
        <Field label={t("common.date")} req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button><button className="btn"><Icon name="check" />{t("claims.collectSave")}</button></div>
      </form>
    </Modal>
  );
}
