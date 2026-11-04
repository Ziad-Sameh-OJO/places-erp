"use client";
import { useState } from "react";
import { PURCHASE_STATUS, type ProcurementOverview } from "@places/contracts";
import { Card, Chip, Icon, Table } from "@/components/ui";
import { Fab, KpiTile } from "@/components/blocks";
import { useMe } from "@/lib/me";
import { ago, money, short } from "@/lib/format";
import { STATUS, useOverview, usePurchases, useVendors, type PurchaseFilter } from "./use-purchases";
import { PurchaseDrawer } from "./purchase-drawer";
import { PurchaseForm } from "./purchase-form";

/** M-08 · the demo's procurement screen: KPI tiles, the filtered requests, and «Budget لكل بند» (10.3). */
export function Purchases() {
  const { can } = useMe();
  const o = useOverview();
  const [f, setF] = useState<PurchaseFilter>({});
  const [page, setPage] = useState(1);
  const list = usePurchases(f, page);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const buyer = can("procurement", "create");
  const items = list.data?.items ?? [];
  return (
    <>
      {o.data && <Kpis o={o.data} />}
      <Toolbar f={f} o={o.data} onChange={(k, v) => { setF({ ...f, [k]: v }); setPage(1); }} onNew={buyer ? () => setForm(true) : undefined} />
      <div className="cols wide">
        <div>
          <Table head={["الطلب", "الحاجة", "المبلغ", "البند", "المورد", "الحالة"]} empty={list.isPending ? "بيحمّل…" : "مفيش طلبات"} onRow={(i) => setOpen(items[i]!.id)}
            rows={items.map((p) => [
              <span key="n" className="mono">{p.no}</span>,
              <span key="i"><b>{p.item}</b><span className="sub">{ago(p.createdAt)}{p.attachments.length > 0 && <> · <Icon name="file" />{p.attachments.length}</>}</span></span>,
              money(p.amount),
              <span key="l">{p.account.name}{p.overBudget && <span className="sub"><Chip tone="bad">هيعدّي الـ Budget</Chip></span>}</span>,
              p.vendor ?? "—",
              <span key="s"><Chip tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Chip>{p.decidedBy && <span className="sub">{p.decidedBy}</span>}</span>,
            ])} />
          {list.data && list.data.total > list.data.pageSize && (
            <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span className="hint">{page} من {Math.ceil(list.data.total / list.data.pageSize)}</span><button className="btn ghost sm" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>اللي بعده</button></div>
          )}
        </div>
        {o.data && <BudgetCard o={o.data} />}
      </div>
      {buyer && <Fab onClick={() => setForm(true)} label="طلب شراء / دفع" />}
      {open && <PurchaseDrawer id={open} cash={o.data?.cash ?? []} onClose={() => setOpen(null)} />}
      {form && o.data && <PurchaseForm lines={o.data.lines} onClose={() => setForm(false)} />}
    </>
  );
}

function Kpis({ o }: { o: ProcurementOverview }) {
  const spentPct = Number(o.totals.budget) ? Math.round((Number(o.totals.spent) / Number(o.totals.budget)) * 100) : 0;
  return (
    <div className="kpis">
      <KpiTile label="مستنية موافقة" value={o.pending} sub="الإدارة / نانسي / أحمد / صفوت" icon="clock" tone="warn" />
      <KpiTile label="جاهزة للصرف" value={o.approved} sub="اتوافق عليها" icon="check" tone="ok" />
      <KpiTile label="إجمالي الـ Budget" value={money(o.totals.budget)} sub={`${o.lines.filter((l) => l.budget).length} بنود`} icon="wallet" />
      <KpiTile label="فاضل" value={money(o.totals.left)} sub={`اتصرف ${spentPct}%`} icon="chart" tone={spentPct > 80 ? "bad" : "ok"} />
    </div>
  );
}

function Toolbar({ f, o, onChange, onNew }: { f: PurchaseFilter; o: ProcurementOverview | undefined; onChange: (k: keyof PurchaseFilter, v: string) => void; onNew: (() => void) | undefined }) {
  const vendors = useVendors();
  const on = (k: keyof PurchaseFilter) => (e: { target: { value: string } }) => onChange(k, e.target.value);
  return (
    <div className="toolbar">
      <select value={f.status ?? ""} onChange={on("status")} aria-label="الحالة"><option value="">كل الحالات</option>{PURCHASE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <select value={f.accountId ?? ""} onChange={on("accountId")} aria-label="البند"><option value="">كل البنود</option>{(o?.lines ?? []).filter((l) => l.budget).map((l) => <option key={l.accountId} value={l.accountId}>{l.name}</option>)}</select>
      <select value={f.group ?? ""} onChange={on("group")} aria-label="نوع المصروف"><option value="">كل الأنواع</option>{(o?.groups ?? []).map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select>
      <select value={f.vendor ?? ""} onChange={on("vendor")} aria-label="المورد"><option value="">كل الموردين</option>{(vendors.data ?? []).map((v) => <option key={v} value={v}>{v}</option>)}</select>
      <label className="date-f"><span>من</span><input type="date" value={f.from ?? ""} onChange={on("from")} /></label>
      <label className="date-f"><span>لحد</span><input type="date" value={f.to ?? ""} onChange={on("to")} /></label>
      <span className="spacer" />
      {onNew && <button className="btn" onClick={onNew}><Icon name="plus" />طلب شراء / دفع</button>}
    </div>
  );
}

/** «Budget لكل بند»: the lines that have a budget, spent / budget with the demo's bar (red above 90%, amber above 70%). */
function BudgetCard({ o }: { o: ProcurementOverview }) {
  const lines = o.lines.filter((l) => l.budget);
  return (
    <Card title="Budget لكل بند" icon="wallet" sub="اتصرف كام وفاضل كام">
      {lines.length === 0 && <p className="hint">لسه مفيش بنود ليها Budget · المحاسب بيحطه من صفحة البادجت في المالية.</p>}
      {lines.map((l) => {
        const pct = Math.min(100, l.pct);
        return (
          <div className="bud" key={l.accountId}>
            <div className="row"><b className="spacer">{l.name}</b><span className="num hint">{short(l.spent)} / {short(l.budget)}</span></div>
            <div className={`bar ${pct > 90 ? "bad" : pct > 70 ? "warn" : ""}`}><i style={{ width: `${Math.max(0, pct)}%` }} /></div>
            <small className="hint">{l.group} · فاضل {money(l.left)}</small>
          </div>
        );
      })}
    </Card>
  );
}
