"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CashView, MoveSaved } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useRefreshFinance, type MoveKind } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const AMOUNT = { inputMode: "decimal" as const, pattern: "\\d+(\\.\\d{1,2})?" };

/**
 * One form for every voucher kind (demo mvNew); the fields follow the kind. Settling a custody passes `settle` (the
 * custody's account). After saving, the voucher opens with its entry and «الأثر على شجرة الحسابات».
 */
/** A recurring bill's voucher comes filled in (9.16); the amount stays editable if the invoice differs. */
export interface MovePrefill { billId?: string; fromId?: string; accountId?: string; amount?: string; party?: string; memo?: string; note?: string }

export function MoveForm({ kind, cash, settle, prefill, onClose, onSaved }: { kind: MoveKind; cash: CashView; settle?: { accountId: string; name: string; balance: string }; prefill?: MovePrefill; onClose: () => void; onSaved: (s: MoveSaved) => void }) {
  const t = useTranslations("finance");
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshFinance();
  const [busy, setBusy] = useState(false);
  const safes = (name: string, label: string) => (
    <Field label={label} req>
      <select name={name} required defaultValue={(name === "fromId" && prefill?.fromId) || ""}>
        <option value="" disabled>{t("common.choose")}</option>
        {cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {serverText(a.name)} · {money(a.balance)}</option>)}
      </select>
    </Field>
  );
  const expenses = (name: string, label: string, req = true) => (
    <Field label={label} req={req}>
      <select name={name} required={req} defaultValue={(name === "accountId" && prefill?.accountId) || ""}>
        <option value="" disabled>{t("common.choose")}</option>
        {cash.expenses.map((e) => <option key={e.id} value={e.id}>{e.code} · {serverText(e.name)}{e.left != null ? ` · ${t("move.budgetLeft", { amount: money(e.left) })}` : ""}</option>)}
      </select>
    </Field>
  );
  const people = (label: string) => (
    <Field label={label} req>
      <select name="partyId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select>
    </Field>
  );
  const submit = onFormSubmit(async (d) => {
    const body: Record<string, string> = { kind };
    for (const [k, v] of d.entries()) if (typeof v === "string" && v.trim()) body[k] = v.trim();
    if (settle) body.accountId = settle.accountId;
    setBusy(true);
    await run(async () => {
      const r = await api.post<MoveSaved>("/finance/moves", body);
      await refresh();
      if (r.budget) toast(t("move.budgetAlert", { text: serverText(r.budget) }));
      onSaved(r);
    }, t("move.saved"));
    setBusy(false);
  });
  return (
    <Modal title={settle ? t("move.settleTitle", { name: settle.name }) : t(`kind.${kind}`)} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        {settle && <Note>{t("move.custodyNow")} <b>{money(settle.balance)}</b></Note>}
        {prefill?.note && <Note>{prefill.note}</Note>}
        {prefill?.billId && <input type="hidden" name="billId" value={prefill.billId} />}
        {kind !== "settle" && <Field label={t("common.date")} req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>}
        {kind === "pay" && <>{safes("fromId", t("common.fromSafe"))}{expenses("accountId", t("move.expenseType"))}
          <Field label={t("move.recipient")} req><input name="party" list="pp-list" required placeholder={t("move.recipientPlaceholder")} defaultValue={prefill?.party ?? ""} /><datalist id="pp-list">{cash.people.map((p) => <option key={p.userId} value={p.name} />)}</datalist></Field>
          <Field label={t("move.ref")}><input name="ref" placeholder={t("common.optional")} /></Field></>}
        {kind === "receive" && <>{safes("toId", t("move.toSafe"))}
          <Field label={t("move.source")} req><select name="accountId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{cash.revenues.map((r) => <option key={r.id} value={r.id}>{r.code} · {serverText(r.name)}</option>)}</select></Field>
          <Field label={t("move.fromWhom")} req><input name="party" required placeholder={t("move.fromWhomPlaceholder")} /></Field></>}
        {kind === "transfer" && <>{safes("fromId", t("common.from"))}{safes("toId", t("common.to"))}</>}
        {kind === "advance" && <>{safes("fromId", t("common.fromSafe"))}{people(t("common.employee"))}</>}
        {kind === "custody" && <>{safes("fromId", t("common.fromSafe"))}{people(t("move.custodyWith"))}</>}
        {kind === "settle" ? <>
          <Field label={t("move.spent")} req><input name="spent" {...AMOUNT} defaultValue="0" required /></Field>{expenses("expenseId", t("move.onLine"), false)}
          <Field label={t("move.returned")} req><input name="returned" {...AMOUNT} defaultValue="0" required /></Field>
          <Field label={t("move.returnedTo")}><select name="toId" defaultValue=""><option value="">—</option>{cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {serverText(a.name)}</option>)}</select></Field>
        </> : <Field label={t("common.amount")} req><input name="amount" {...AMOUNT} required defaultValue={prefill?.amount ?? ""} /></Field>}
        <Field label={t("common.memo")} req wide><input name="memo" required minLength={2} defaultValue={prefill?.memo ?? ""} placeholder={kind === "settle" ? t("move.settleMemoPlaceholder") : t("move.memoPlaceholder")} /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button><button className="btn" disabled={busy}>{busy ? t("common.saving") : settle ? t("move.saveSettle") : t("common.record")}</button></div>
      </form>
    </Modal>
  );
}
