"use client";
import { useState, type ReactNode } from "react";
import type { CommissionPaid, CommissionPerson, CommissionStatement } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useCash, useCommission, useCommissionPeople, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const tone = (state: string) => (state.startsWith("مستحقة") ? "ok" : state.startsWith("مستنية") ? "warn" : "");
const rate = (d: CommissionStatement["deals"][number]) => d.shares.map((s) => `${s.side === "seller" ? "Seller" : "Buyer"} · ${s.schemePercent}% × ${money(s.share)}`).join(" + ");
type Pay = { emp: string; deal?: string };

/**
 * M-07 9.15 (demo «المرتبات» ← العمولة): everyone with a 21103 account and what's owed, «كشف عمولة» per person and
 * «صرف عمولة سيلز» (on one fully collected deal against its TCR, or a TL's commission without a deal).
 */
export function Commissions() {
  const { can } = useMe();
  const q = useCommissionPeople();
  const [open, setOpen] = useState<string | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [voucher, setVoucher] = useState<string | null>(null);
  const canPost = can("finance", "create");
  const due = (q.data ?? []).filter((p) => Number(p.balance) > 0);
  return (
    <Card title="عمولات السيلز" icon="trend" sub="بتتصرف لوحدها لكل صفقة بالـ TCR · من ح/ عمولة السيلز (21103) إلى ح/ الخزنة"
      extra={canPost && due.length > 0 && <button className="btn" onClick={() => setPay({ emp: due[0]!.employeeId })}><Icon name="wallet" />صرف عمولة سيلز</button>}>
      {!q.data ? <Empty text="بيحمّل…" icon="clock" /> : (
        <Table head={["السيلز", "الحساب", "عمولة مستحقة", ""]} empty="مفيش عمولات لسه · بتبقى مستحقة لما الصفقة تتحصّل بالكامل"
          rows={q.data.map((p) => [
            <a key="n" className="click" onClick={() => setOpen(p.employeeId)}><b>{p.name}</b></a>, <span key="c" className="mono">{p.code}</span>,
            <a key="b" className="click" onClick={() => setOpen(p.employeeId)}>{Number(p.balance) ? money(p.balance) : "—"}</a>,
            canPost && Number(p.balance) > 0 ? <button key="p" className="btn sm" onClick={() => setPay({ emp: p.employeeId })}>اصرف</button> : "",
          ])} />
      )}
      <Note>العمولة بتبقى مستحقة لما الصفقة تتحصّل بالكامل، وبتظهر في حساب السيلز تحت «عمولة مبيعات مستحقة» (21103). دوس على العمولة تشوف كشفها صفقة صفقة، و«اصرف» بيعمل إذن «صرف عمولة سيلز» بقيده.</Note>
      {open && <Statement id={open} canPost={canPost} onPay={(p) => { setOpen(null); setPay(p); }} onVoucher={setVoucher} onClose={() => setOpen(null)} />}
      {pay && q.data && <PayoutForm people={due} start={pay} onClose={() => setPay(null)} onSaved={(id) => { setPay(null); setVoucher(id); }} />}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </Card>
  );
}

/** «كشف عمولة» (demo commStatement): each deal with his part and state, what was paid, and the vouchers. */
function Statement({ id, canPost, onPay, onVoucher, onClose }: { id: string; canPost: boolean; onPay: (p: Pay) => void; onVoucher: (id: string) => void; onClose: () => void }) {
  const s = useCommission(id).data;
  if (!s) return null;
  return (
    <Modal title={`كشف عمولة · ${s.employee.name}`} onClose={onClose}>
      <div className="pdf">
        <Note><b>المستحق دلوقتي = {money(s.balance)}</b><br />العمولة = نسبة السيلز (الـ Scheme) × نصيبه في الصفقة (Buyer أو Seller) × عمولة Places، وبتبقى مستحقة لما الصفقة تتحصّل بالكامل.</Note>
        {s.deals.length > 0 && <Table head={["الصفقة", "العميل", "نسبته", "الحالة", "عمولته", "اتصرف", ""]}
          rows={s.deals.map((d) => [<span key="c" className="mono">{d.code}</span>, d.company, rate(d), <Chip key="s" tone={tone(d.state)} plain>{d.state}</Chip>, money(d.commission),
            Number(d.paid) ? money(d.paid) : "—", canPost && Number(d.due) > 0 ? <button key="p" className="btn sm" onClick={() => onPay({ emp: id, deal: d.dealId })}>اصرف {money(d.due)}</button> : ""])} />}
        {Number(s.tlDue) > 0 && <Note kind="ok">عمولة Team Leader (على تحقيق الفريق مش على صفقة): <b>{money(s.tlDue)}</b> مستحقة
          {canPost && <> · <button className="btn sm" onClick={() => onPay({ emp: id })}>اصرف {money(s.tlDue)}</button></>}</Note>}
        {s.payouts.length > 0 && <>
          <h4 className="mini-h">اتصرفله</h4>
          <Table head={["السند", "التاريخ", "الصفقة", "الـ TCR", "المبلغ"]} onRow={(i) => onVoucher(s.payouts[i]!.moveId)}
            rows={s.payouts.map((p) => [<span key="m" className="mono">{p.move}</span>, p.date, <span key="d" className="mono">{p.deal ?? "—"}</span>, <span key="t" className="mono">{p.tcr ?? "—"}</span>, money(p.amount)])} />
        </>}
      </div>
    </Modal>
  );
}

/** إذن «صرف عمولة سيلز» (demo mvNew commission): the person, the deal (or the TL's commission), its TCR, the safe and the amount. */
function PayoutForm({ people, start, onClose, onSaved }: { people: CommissionPerson[]; start: Pay; onClose: () => void; onSaved: (moveId: string) => void }) {
  const run = useAction();
  const refresh = useRefreshFinance();
  const cash = useCash().data;
  const [emp, setEmp] = useState(start.emp);
  const [dealId, setDealId] = useState(start.deal);
  const [busy, setBusy] = useState(false);
  const s = useCommission(emp).data;
  const deals = s?.deals.filter((d) => Number(d.due) > 0) ?? [];
  const deal = deals.find((d) => d.dealId === dealId) ?? deals[0];
  const tl = !!s && !deal && Number(s.tlDue) > 0;
  const due = deal ? deal.due : tl ? s.tlDue : null;
  const submit = onFormSubmit(async (d) => {
    const body: Record<string, string> = { employeeId: emp };
    for (const [k, v] of d.entries()) if (typeof v === "string" && v.trim()) body[k] = v.trim();
    setBusy(true);
    await run(async () => {
      const r = await api.post<CommissionPaid>("/finance/commissions/payouts", body);
      await refresh();
      onSaved(r.moveId);
    }, "اتصرفت العمولة · السيلز اتبلّغ");
    setBusy(false);
  });
  return (
    <Modal title="صرف عمولة سيلز" onClose={onClose}>
      {!s || !cash ? <Empty text="بيحمّل…" icon="clock" /> : (
        <form className="grid" onSubmit={submit} key={`${emp}:${deal?.dealId ?? ""}`}>
          <Field label="من خزنة / بنك" req><select name="fromId" required defaultValue=""><option value="" disabled>اختار</option>{cash.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} · {money(a.balance)}</option>)}</select></Field>
          <Field label={tl ? "السيلز / الـ TL" : "السيلز"} req>
            <select value={emp} onChange={(e) => { setEmp(e.target.value); setDealId(undefined); }}>{people.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.name} · مستحق {money(p.balance)}</option>)}</select>
          </Field>
          {deal ? <>
            <Field label="الصفقة اللي بتصرف عمولتها" req wide>
              <select name="dealId" value={deal.dealId} onChange={(e) => setDealId(e.target.value)}>{deals.map((d) => <option key={d.dealId} value={d.dealId}>{d.code} · {d.company} · مستحق {money(d.due)}</option>)}</select>
            </Field>
            <dl className="kv wide card flat">{([["العميل", deal.company], ["الوحدة", deal.unitCode], ["عمولة Places", money(deal.placesCommission)], ["نصيبه", <>{rate(deal)} = <b>{money(deal.commission)}</b></>], ["اتصرفله منها", money(deal.paid)]] as [string, ReactNode][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <Field label="الـ TCR اللي هيمضي عليها" wide>
              <select name="tcrId" defaultValue={deal.tcrs[0]?.id ?? ""}>{deal.tcrs.map((t) => <option key={t.id} value={t.id}>{t.code} · {money(t.amount)} · {t.side === "owner" ? "من الـ Owner" : "من الـ Client"} · {t.signed ? "مضى ✓" : "لسه مامضاش"}</option>)}<option value="">من غير TCR</option></select>
            </Field>
          </> : tl ? <Note>عمولة Team Leader: على تحقيق الفريق مش على صفقة · المستحق <b>{money(s.tlDue)}</b></Note>
            : <Note kind="warn">مفيش عمولة مستحقة دلوقتي</Note>}
          {due && <>
            <Field label="المبلغ" req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required defaultValue={due} /></Field>
            <Field label="تاريخ الصرف" req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>
            <Field label="البيان" wide><input name="memo" placeholder="اختياري" /></Field>
          </>}
          <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>{due && <button className="btn" disabled={busy}><Icon name="check" />{busy ? "بيحفظ…" : "سجّل"}</button>}</div>
        </form>
      )}
    </Modal>
  );
}
