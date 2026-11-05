"use client";
import { useState } from "react";
import type { PayrollRowView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useCash, usePayroll, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";
import { LedgerModal } from "./ledger-modal";
import { Commissions } from "./commissions";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * M-07 · «المرتبات» (9.14 + 9.3's advance deduction; demo payroll() / payRunNew): everyone at once — salary −
 * attendance deduction − the advance deduction the accountant chose = net — as one voucher with one entry.
 */
export function Payroll() {
  const { can } = useMe();
  const q = usePayroll(), cash = useCash();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [paying, setPaying] = useState(false);
  const [voucher, setVoucher] = useState<string | null>(null);
  const [ledger, setLedger] = useState<string | null>(null);
  if (!q.data || !cash.data) return <Empty text="بيحمّل…" icon="clock" />;
  const p = q.data, canPost = can("finance", "create"), canEdit = can("finance", "edit");
  const plan = (r: PayrollRowView, v: string) => run(async () => { await api.put(`/finance/payroll/advances/${r.userId}`, { amount: v || "0" }); await refresh(); }, `${r.name}: هيتخصم ${money(v || "0")} الشهر ده`);
  const pay = onFormSubmit(async (d) => run(async () => {
    const r = await api.post<{ move: { id: string } }>("/finance/payroll/run", { fromId: d.get("fromId"), date: d.get("date") });
    await refresh(); setPaying(false); setVoucher(r.move.id);
  }, "اتصرفت المرتبات · كل موظف اتبلّغ بصافي مرتبه"));
  return (
    <>
      {p.run ? (
        <Note kind="ok"><b>مرتبات {p.label} اتصرفت</b> · {p.run.at.slice(0, 10)} · {money(p.run.net)} من {p.run.from} · <a className="mono click" onClick={() => setVoucher(p.run!.move.id)}>{p.run.move.no}</a></Note>
      ) : (
        <Card title={`مرتبات ${p.label} لسه ماتصرفتش`} icon="wallet" className="attn" sub="بتتصرف كلها مرة واحدة: المرتب − خصم الحضور − خصم السلفة اللي اخترته"
          extra={<Chip tone={p.due ? "warn" : ""}>{p.due ? "ميعادها جه" : `ميعادها يوم ${p.payDay}`}</Chip>}>
          <div className="row">
            {canPost && p.rows.length > 0 && <button className="btn" onClick={() => setPaying(true)}><Icon name="wallet" />اصرف المرتبات كلها · {money(p.totals.net)}</button>}
            <span className="spacer" />
            <label className="row hint">ميعاد صرف المرتبات يوم
              <input type="number" min={1} max={28} defaultValue={p.payDay} disabled={!canEdit} style={{ maxWidth: 70 }} aria-label="ميعاد صرف المرتبات"
                onBlur={(e) => { const v = Number(e.target.value); if (v !== p.payDay && v >= 1 && v <= 28) void run(async () => { await api.patch("/finance/payroll/day", { day: v }); await refresh(); }, "اتحفظ"); }} /> في الشهر</label>
          </div>
        </Card>
      )}
      <div className="kpis">
        <KpiTile label="المرتبات" value={money(p.totals.salary)} sub={`${p.totals.people} موظف · الأساسي`} icon="id" />
        <KpiTile label="خصم الحضور" value={money(p.totals.attendance)} sub="بعد اعتماد الـ HR" icon="clock" tone="bad" />
        <KpiTile label="خصم السلف" value={money(p.totals.advance)} sub="اللي اخترته الشهر ده" icon="users" />
        <KpiTile label="صافي المرتبات" value={money(p.totals.net)} sub="بعد خصم الحضور والسلف" icon="wallet" />
      </div>
      {!p.rows.length ? <Note kind="warn">مفيش مرتبات متسجلة لسه · الـ HR بتدخّل مرتب كل موظف من فايله في «الموارد البشرية».</Note> : (
        <Table head={["الموظف", "المرتب", "خصم الحضور", "عليه سلفة", "خصم السلفة الشهر ده", "صافي المرتب"]}
          rows={p.rows.map((r) => [
            <span key="n"><b>{r.name}</b><span className="sub">{r.line === "sales" ? "مرتبات مبيعات (5301)" : "مرتبات ادارية (5202)"}</span></span>, money(r.salary),
            Number(r.attendance) ? `−${money(r.attendance)}` : "—",
            Number(r.advanceLeft) ? <a key="l" className="click" onClick={() => setLedger(r.advanceAccountId)}>{money(r.advanceLeft)}</a> : "—",
            Number(r.advanceLeft) && canPost && !p.run
              ? <input key={`a${r.advance}`} style={{ width: 100 }} inputMode="decimal" defaultValue={r.advance} aria-label={`خصم سلفة ${r.name}`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.advance && /^\d+(\.\d{1,2})?$/.test(v)) void plan(r, v); }} />
              : Number(r.advance) ? `−${money(r.advance)}` : "—",
            <b key="net">{money(r.net)}</b>,
          ])} />
      )}
      <Note kind={p.deductionsApproved ? "ok" : "warn"}>{p.deductionsApproved ? "الخصومات اتعتمدت من الـ HR واترحّلت. والمرتبات بعد الخصم بتتحمّل على المصروفات أوتوماتيك." : "خصومات الشهر لسه مستنية اعتماد الـ HR، فمش محسوبة هنا."}</Note>
      <Note>العمولات مش هنا: بتتصرف لوحدها لكل صفقة بالـ TCR. خصم السلفة الافتراضي = كل اللي عليه، والشهر الجاي بيبدأ بنفس اختيارك.</Note>
      <Commissions />
      {paying && (
        <Modal title={`صرف مرتبات ${p.label}`} onClose={() => setPaying(false)}>
          <form className="grid" onSubmit={pay}>
            <Note>كل المرتبات مرة واحدة. السيستم بيعمل إذن «صرف مرتبات» واحد بقيده، وكل موظف بيجيله إشعار بصافي مرتبه.</Note>
            <div className="wide"><Table head={["الإجمالي", "المرتب", "خصم الحضور", "خصم السلفة", "الصافي"]}
              rows={[[`${p.totals.people} موظف`, money(p.totals.salary), money(p.totals.attendance), money(p.totals.advance), <b key="n">{money(p.totals.net)}</b>]]} /></div>
            <Field label="بتتصرف من" req><select name="fromId" required defaultValue=""><option value="" disabled>اختار</option>{cash.data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>)}</select></Field>
            <Field label="تاريخ الصرف" req><input name="date" type="date" defaultValue={today()} max={today()} required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setPaying(false)}>إلغاء</button><button className="btn"><Icon name="check" />اصرف {money(p.totals.net)}</button></div>
          </form>
        </Modal>
      )}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
