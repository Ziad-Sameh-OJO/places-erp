"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PURCHASE_STATUS, type ProcurementOverview } from "@places/contracts";
import { Card, Chip, ExportButton, Icon, Table } from "@/components/ui";
import { Fab, KpiTile } from "@/components/blocks";
import { useMe } from "@/lib/me";
import { ago, money, short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { STATUS, filterQuery, useOverview, usePurchases, useVendors, type PurchaseFilter } from "./use-purchases";
import { PurchaseDrawer } from "./purchase-drawer";
import { PurchaseForm } from "./purchase-form";

/** M-08 · the demo's procurement screen: KPI tiles, the filtered requests, and «Budget لكل بند» (10.3). */
export function Purchases() {
  const t = useTranslations("procurement");
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
          <Table head={[t("list.request"), t("form.item"), t("common.amount"), t("common.line"), t("common.vendor"), t("list.status")]} empty={list.isPending ? t("common.loading") : t("list.empty")} onRow={(i) => setOpen(items[i]!.id)}
            rows={items.map((p) => [
              <span key="n" className="mono">{p.no}</span>,
              <span key="i"><b>{p.item}</b><span className="sub">{ago(p.createdAt)}{p.attachments.length > 0 && <> · <Icon name="file" />{p.attachments.length}</>}</span></span>,
              money(p.amount),
              <span key="l">{serverText(p.account.name)}{p.overBudget && <span className="sub"><Chip tone="bad">{t("list.overBudget")}</Chip></span>}</span>,
              p.vendor ?? "—",
              <span key="s"><Chip tone={STATUS[p.status]}>{t(`status.${p.status}`)}</Chip>{p.decidedBy && <span className="sub">{p.decidedBy}</span>}</span>,
            ])} />
          {list.data && list.data.total > list.data.pageSize && (
            <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</button><span className="hint">{t("common.pageOf", { page: String(page), pages: String(Math.ceil(list.data.total / list.data.pageSize)) })}</span><button className="btn ghost sm" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>{t("common.next")}</button></div>
          )}
        </div>
        {o.data && <BudgetCard o={o.data} />}
      </div>
      {buyer && <Fab onClick={() => setForm(true)} label={t("form.title")} />}
      {open && <PurchaseDrawer id={open} cash={o.data?.cash ?? []} onClose={() => setOpen(null)} />}
      {form && o.data && <PurchaseForm lines={o.data.lines} onClose={() => setForm(false)} />}
    </>
  );
}

function Kpis({ o }: { o: ProcurementOverview }) {
  const t = useTranslations("procurement");
  const spentPct = Number(o.totals.budget) ? Math.round((Number(o.totals.spent) / Number(o.totals.budget)) * 100) : 0;
  const budgeted = o.lines.filter((l) => l.budget).length;
  return (
    <div className="kpis">
      <KpiTile label={t("kpis.pending")} value={o.pending} sub={t("kpis.pendingSub")} icon="clock" tone="warn" />
      <KpiTile label={t("kpis.approved")} value={o.approved} sub={t("kpis.approvedSub")} icon="check" tone="ok" />
      <KpiTile label={t("kpis.budget")} value={money(o.totals.budget)} sub={t("kpis.lines", { count: budgeted, n: String(budgeted) })} icon="wallet" />
      <KpiTile label={t("kpis.left")} value={money(o.totals.left)} sub={t("kpis.spentPct", { pct: String(spentPct) })} icon="chart" tone={spentPct > 80 ? "bad" : "ok"} />
    </div>
  );
}

function Toolbar({ f, o, onChange, onNew }: { f: PurchaseFilter; o: ProcurementOverview | undefined; onChange: (k: keyof PurchaseFilter, v: string) => void; onNew: (() => void) | undefined }) {
  const t = useTranslations("procurement");
  const vendors = useVendors();
  const on = (k: keyof PurchaseFilter) => (e: { target: { value: string } }) => onChange(k, e.target.value);
  return (
    <div className="toolbar">
      <select value={f.status ?? ""} onChange={on("status")} aria-label={t("list.status")}><option value="">{t("toolbar.allStatuses")}</option>{PURCHASE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <select value={f.accountId ?? ""} onChange={on("accountId")} aria-label={t("common.line")}><option value="">{t("toolbar.allLines")}</option>{(o?.lines ?? []).filter((l) => l.budget).map((l) => <option key={l.accountId} value={l.accountId}>{serverText(l.name)}</option>)}</select>
      <select value={f.group ?? ""} onChange={on("group")} aria-label={t("toolbar.group")}><option value="">{t("toolbar.allGroups")}</option>{(o?.groups ?? []).map((g) => <option key={g.code} value={g.code}>{serverText(g.name)}</option>)}</select>
      <select value={f.vendor ?? ""} onChange={on("vendor")} aria-label={t("common.vendor")}><option value="">{t("toolbar.allVendors")}</option>{(vendors.data ?? []).map((v) => <option key={v} value={v}>{v}</option>)}</select>
      <label className="date-f"><span>{t("common.from")}</span><input type="date" value={f.from ?? ""} onChange={on("from")} /></label>
      <label className="date-f"><span>{t("common.until")}</span><input type="date" value={f.to ?? ""} onChange={on("to")} /></label>
      <span className="spacer" />
      <ExportButton module="procurement" path="/procurement/purchases/export" query={filterQuery(f)} filename={t("toolbar.file")} label={t("toolbar.export")} />
      {onNew && <button className="btn" onClick={onNew}><Icon name="plus" />{t("form.title")}</button>}
    </div>
  );
}

/** «Budget لكل بند»: the lines that have a budget, spent / budget with the demo's bar (red above 90%, amber above 70%). */
function BudgetCard({ o }: { o: ProcurementOverview }) {
  const t = useTranslations("procurement");
  const lines = o.lines.filter((l) => l.budget);
  return (
    <Card title={t("budget.title")} icon="wallet" sub={t("budget.sub")}>
      {lines.length === 0 && <p className="hint">{t("budget.empty")}</p>}
      {lines.map((l) => {
        const pct = Math.min(100, l.pct);
        return (
          <div className="bud" key={l.accountId}>
            <div className="row"><b className="spacer">{serverText(l.name)}</b><span className="num hint">{short(l.spent)} / {short(l.budget)}</span></div>
            <div className={`bar ${pct > 90 ? "bad" : pct > 70 ? "warn" : ""}`}><i style={{ width: `${Math.max(0, pct)}%` }} /></div>
            <small className="hint">{serverText(l.group)} · {t("common.left", { amount: money(l.left) })}</small>
          </div>
        );
      })}
    </Card>
  );
}
