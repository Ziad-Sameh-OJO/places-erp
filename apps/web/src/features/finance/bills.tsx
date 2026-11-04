"use client";
import { useState } from "react";
import type { BillView, CashView, MoveEffect, MoveView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useBills, useCash, useRefreshFinance } from "./use-finance";
import { MoveForm, type MovePrefill } from "./move-form";
import { Voucher, VoucherById } from "./voucher";

const TONE: Record<BillView["state"], "ok" | "warn" | ""> = { paid: "ok", skipped: "", off: "", due: "warn", soon: "warn", later: "" };

/** «وافق واصرف» + «مش الشهر ده» for one bill, shared by the tab and the card in «الخزن والحركات». */
function useBillActions(cash: CashView | undefined, label: string) {
  const [pay, setPay] = useState<MovePrefill | null>(null);
  const [skip, setSkip] = useState<BillView | null>(null);
  const [saved, setSaved] = useState<{ move: MoveView; effect: MoveEffect[] } | null>(null);
  const run = useAction();
  const refresh = useRefreshFinance();
  const open = (b: BillView) => setPay({ billId: b.id, fromId: b.from.id, accountId: b.account.id, amount: b.amount, party: b.vendor, memo: `${b.name} · ${label}`,
    note: `فاتورة ثابتة ${b.name} · ميعادها يوم ${b.day} · المبلغ المعتاد ${money(b.amount)} (عدّله لو الفاتورة مختلفة)` });
  const ui = (
    <>
      {pay && cash && <MoveForm kind="pay" cash={cash} prefill={pay} onClose={() => setPay(null)} onSaved={(s) => { setPay(null); setSaved(s); }} />}
      {saved && <Voucher move={saved.move} effect={saved.effect} onClose={() => setSaved(null)} />}
      {skip && (
        <Modal title={`${skip.name} · مش الشهر ده`} onClose={() => setSkip(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (d) => run(async () => { await api.post(`/finance/bills/${skip.id}/skip`, { reason: String(d.get("reason") ?? "") }); await refresh(); setSkip(null); }, "اتأجلت للشهر الجاي"))}>
            <Field label="ليه مش هتتصرف الشهر ده؟" req wide><input name="reason" required minLength={2} /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setSkip(null)}>إلغاء</button><button className="btn">سجّل</button></div>
          </form>
        </Modal>
      )}
    </>
  );
  return { open, skip: setSkip, ui };
}

/** The card in «الخزن والحركات» (demo billCard): only the bills whose day came. */
export function DueBillsCard({ cash }: { cash: CashView }) {
  const { can } = useMe();
  const q = useBills();
  const a = useBillActions(cash, q.data?.label ?? "");
  const due = q.data?.items.filter((b) => b.state === "due") ?? [];
  if (!due.length) return a.ui;
  return (
    <>
      <Card title="فواتير ثابتة ميعادها جه" icon="calendar" sub="مفيش حاجة بتتصرف لوحدها · انت اللي بتوافق وتصرف أو تأجّل الشهر ده" className="attn" extra={<Chip tone="warn">{due.length}</Chip>}>
        <Table head={["الفاتورة", "البند", "الميعاد", "المبلغ المعتاد", ""]} rows={due.map((b) => [
          <span key="n"><b>{b.name}</b><span className="sub">{b.vendor}</span></span>, b.account.name, `يوم ${b.day}`, <b key="a">{money(b.amount)}</b>,
          can("finance", "create") ? <span key="x" className="row"><button className="btn sm" onClick={() => a.open(b)}>وافق واصرف</button><button className="btn ghost sm" onClick={() => a.skip(b)}>مش الشهر ده</button></span> : "",
        ])} />
      </Card>
      {a.ui}
    </>
  );
}

/** M-07 · «الفواتير الثابتة» (9.16): every bill, its state this month, its voucher or reason, stop / start, and a new one. */
export function Bills() {
  const { can } = useMe();
  const q = useBills();
  const cash = useCash();
  const run = useAction();
  const refresh = useRefreshFinance();
  const a = useBillActions(cash.data, q.data?.label ?? "");
  const [voucher, setVoucher] = useState<string | null>(null);
  if (!q.data || !cash.data) return <Empty text="بيحمّل…" icon="clock" />;
  const canPost = can("finance", "create"), canEdit = can("finance", "edit");
  const toggle = (b: BillView) => run(async () => { await api.patch(`/finance/bills/${b.id}`, { active: !b.active }); await refresh(); }, b.active ? "اتوقفت" : "اتفعّلت");
  const add = onFormSubmit(async (d) => run(async () => {
    await api.post("/finance/bills", { name: d.get("name"), vendor: d.get("vendor"), accountId: d.get("accountId"), fromId: d.get("fromId"), amount: d.get("amount"), day: Number(d.get("day")) });
    await refresh();
  }, "اتضافت · هتجيلك مهمة يوم ميعادها"));
  return (
    <>
      <Note>الفاتورة الثابتة (اشتراك، إيجار، إنترنت…) مابتتصرفش لوحدها: يوم ميعادها بيجيلك إشعار والكارت في «الخزن والحركات»، وانت اللي بتوافق وتصرف (إذن صرف بقيده) أو تقول «مش الشهر ده».</Note>
      <Table head={["الفاتورة", "البند", "من", "يوم", "المبلغ", q.data.label, ""]} empty="مفيش فواتير ثابتة"
        rows={q.data.items.map((b) => [
          <span key="n"><b>{b.name}</b><span className="sub">{b.vendor}</span></span>, `${b.account.code} · ${b.account.name}`, b.from.name, b.day, money(b.amount),
          <span key="s"><Chip tone={TONE[b.state]}>{b.stateLabel}</Chip>{b.move && <> <a className="mono click" onClick={() => setVoucher(b.move!.id)}>{b.move.no}</a></>}{b.reason && <span className="sub">{b.reason}</span>}</span>,
          <span key="x" className="row">
            {canPost && (b.state === "due" || b.state === "soon") && <button className="btn sm" onClick={() => a.open(b)}>وافق واصرف</button>}
            {canPost && b.state === "due" && <button className="btn ghost sm" onClick={() => a.skip(b)}>مش الشهر ده</button>}
            {canEdit && <button className="btn ghost sm" onClick={() => void toggle(b)}>{b.active ? "وقّفها" : "شغّلها"}</button>}
          </span>,
        ])} />
      {canPost && (
        <form className="card flat grid" onSubmit={add}>
          <Field label="الفاتورة" req><input name="name" required placeholder="مثلاً: اشتراك Bayut" /></Field>
          <Field label="المورد" req><input name="vendor" required /></Field>
          <Field label="البند" req><select name="accountId" required defaultValue=""><option value="" disabled>اختار</option>{cash.data.expenses.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></Field>
          <Field label="المبلغ المعتاد" req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
          <Field label="يوم في الشهر" req><input name="day" type="number" min={1} max={28} defaultValue={1} required /></Field>
          <Field label="بتتصرف من" req><select name="fromId" required defaultValue=""><option value="" disabled>اختار</option>{cash.data.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="row end wide"><button className="btn"><Icon name="plus" />ضيف فاتورة ثابتة</button></div>
        </form>
      )}
      {a.ui}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </>
  );
}
