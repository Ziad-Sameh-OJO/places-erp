"use client";
import { useState } from "react";
import type { CashView, MoveSaved } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { KIND, useRefreshFinance, type MoveKind } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const AMOUNT = { inputMode: "decimal" as const, pattern: "\\d+(\\.\\d{1,2})?" };

/**
 * One form for every voucher kind (demo mvNew); the fields follow the kind. Settling a custody passes `settle` (the
 * custody's account). After saving, the voucher opens with its entry and «الأثر على شجرة الحسابات».
 */
/** A recurring bill's voucher comes filled in (9.16); the amount stays editable if the invoice differs. */
export interface MovePrefill { billId?: string; fromId?: string; accountId?: string; amount?: string; party?: string; memo?: string; note?: string }

export function MoveForm({ kind, cash, settle, prefill, onClose, onSaved }: { kind: MoveKind; cash: CashView; settle?: { accountId: string; name: string; balance: string }; prefill?: MovePrefill; onClose: () => void; onSaved: (s: MoveSaved) => void }) {
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshFinance();
  const [busy, setBusy] = useState(false);
  const safes = (name: string, label: string) => (
    <Field label={label} req>
      <select name={name} required defaultValue={(name === "fromId" && prefill?.fromId) || ""}>
        <option value="" disabled>اختار</option>
        {cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} · {money(a.balance)}</option>)}
      </select>
    </Field>
  );
  const expenses = (name: string, label: string, req = true) => (
    <Field label={label} req={req}>
      <select name={name} required={req} defaultValue={(name === "accountId" && prefill?.accountId) || ""}>
        <option value="" disabled>اختار</option>
        {cash.expenses.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}{e.left != null ? ` · فاضل من البادجت ${money(e.left)}` : ""}</option>)}
      </select>
    </Field>
  );
  const people = (label: string) => (
    <Field label={label} req>
      <select name="partyId" required defaultValue=""><option value="" disabled>اختار</option>{cash.people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select>
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
      if (r.budget) toast(`تنبيه: ${r.budget}`);
      onSaved(r);
    }, `اتسجّل · قيد اليومية اتعمل لوحده`);
    setBusy(false);
  });
  return (
    <Modal title={settle ? `تسوية عهدة · ${settle.name}` : KIND[kind][0]} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        {settle && <Note>العهدة دلوقتي: <b>{money(settle.balance)}</b></Note>}
        {prefill?.note && <Note>{prefill.note}</Note>}
        {prefill?.billId && <input type="hidden" name="billId" value={prefill.billId} />}
        {kind !== "settle" && <Field label="التاريخ" req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>}
        {kind === "pay" && <>{safes("fromId", "من خزنة / بنك")}{expenses("accountId", "نوع المصروف (من شجرة الحسابات)")}
          <Field label="المستلم" req><input name="party" list="pp-list" required placeholder="اسم اللي هيستلم الفلوس" defaultValue={prefill?.party ?? ""} /><datalist id="pp-list">{cash.people.map((p) => <option key={p.userId} value={p.name} />)}</datalist></Field>
          <Field label="رقم الفاتورة / المرجع"><input name="ref" placeholder="اختياري" /></Field></>}
        {kind === "receive" && <>{safes("toId", "لخزنة / بنك")}
          <Field label="المصدر" req><select name="accountId" required defaultValue=""><option value="" disabled>اختار</option>{cash.revenues.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></Field>
          <Field label="من مين" req><input name="party" required placeholder="اسم الجهة" /></Field></>}
        {kind === "transfer" && <>{safes("fromId", "من")}{safes("toId", "لـ")}</>}
        {kind === "advance" && <>{safes("fromId", "من خزنة / بنك")}{people("الموظف")}</>}
        {kind === "custody" && <>{safes("fromId", "من خزنة / بنك")}{people("العهدة مع")}</>}
        {kind === "settle" ? <>
          <Field label="اتصرف منها" req><input name="spent" {...AMOUNT} defaultValue="0" required /></Field>{expenses("expenseId", "على بند", false)}
          <Field label="رجع نقدي" req><input name="returned" {...AMOUNT} defaultValue="0" required /></Field>
          <Field label="رجع لخزنة"><select name="toId" defaultValue=""><option value="">—</option>{cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        </> : <Field label="المبلغ" req><input name="amount" {...AMOUNT} required defaultValue={prefill?.amount ?? ""} /></Field>}
        <Field label="البيان" req wide><input name="memo" required minLength={2} defaultValue={prefill?.memo ?? ""} placeholder={kind === "settle" ? "مثلاً: 6 فواتير صيانة" : "مثلاً: فاتورة كهرباء أكتوبر"} /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy}>{busy ? "بيحفظ…" : settle ? "سجّل التسوية" : "سجّل"}</button></div>
      </form>
    </Modal>
  );
}
