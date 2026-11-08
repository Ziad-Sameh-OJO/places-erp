"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { PeriodView } from "@places/contracts";
import { Card, Chip, Empty, Icon, Modal, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import type { IconName } from "@places/ui";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { money, short } from "./money";
import { serverText } from "@/lib/server-text";
import { useBills, useBudget, useCash, useIncome, usePayroll } from "./use-finance";
import { LedgerModal } from "./ledger-modal";
import { useCollectLines } from "./today";

export type FinanceTab = "dash" | "cash" | "custody" | "journal" | "bills" | "claims" | "pnl" | "bs" | "budget" | "cost" | "payroll" | "tree";
interface Todo { tone: "warn" | "bad"; icon: IconName; title: string; sub: string; tab?: FinanceTab; href?: string; btn: string }

/**
 * 9.4 · داشبورد المالية (M-07 5.1 + the client's request): «مستنيك النهارده» on top (the same items as the home page),
 * net profit to date and its stages from the same numbers as the income statement (9.7), the safes and banks, and the
 * employees' advances (a click shows each balance).
 */
export function Dashboard({ go }: { go: (t: FinanceTab) => void }) {
  const t = useTranslations("finance");
  const { can } = useMe();
  const collect = useCollectLines(can("finance", "create"));
  const year = useIncome("year"), cash = useCash(), bills = useBills(), budget = useBudget(), payroll = usePayroll();
  const periods = useQuery({ queryKey: ["finance", "periods"], queryFn: () => api.get<PeriodView[]>("/finance/periods") });
  const [advances, setAdvances] = useState(false);
  const [ledger, setLedger] = useState<string | null>(null);
  // M-09: a hidden amount comes blank, so what's summed here stays blank too (and the waterfall goes)
  const showsMoney = useFields("finance").shows("amount");
  const d = (n: number) => (showsMoney ? n.toFixed(2) : "");
  if (!year.data || !cash.data) return <Empty text={t("common.loading")} icon="clock" />;
  const p = year.data, c = cash.data;
  const todo: Todo[] = [];
  if (can("finance", "create")) {
    const pr = payroll.data;
    if (pr?.due && pr.rows.length) todo.push({ tone: "warn", icon: "wallet", title: t("dash.payrollTitle", { label: serverText(pr.label) }), sub: t("dash.payrollSub", { count: pr.totals.people, n: String(pr.totals.people), net: money(pr.totals.net) }), tab: "payroll", btn: t("dash.open") });
    for (const b of bills.data?.items.filter((x) => x.state === "due") ?? []) todo.push({ tone: "warn", icon: "calendar", title: t("dash.billTitle", { name: b.name }), sub: t("dash.billSub", { amount: money(b.amount), vendor: b.vendor }), tab: "cash", btn: t("dash.open") });
    for (const r of budget.data?.rows.filter((x) => x.level === "bad" || x.level === "warn") ?? [])
      todo.push({ tone: r.level === "bad" ? "bad" : "warn", icon: "wallet", title: r.level === "bad" ? t("dash.lineOver", { name: serverText(r.name) }) : t("dash.lineNear", { name: serverText(r.name) }), sub: t("dash.lineSub", { spent: money(r.spent), budget: money(r.budget ?? "0") }), tab: "budget", btn: t("dash.open") });
    for (const x of collect) todo.push({ tone: "warn", icon: x.icon, title: x.title, sub: x.sub, href: x.href, btn: x.button }); // M-02 · «حصّل عمولة»
  }
  const sa = Number(p.selling) + Number(p.admin) + Number(p.other);
  const wf: [string, number, "acc" | "bad" | "ok"][] = [[t("dash.wf.revenue"), Number(p.revenue), "acc"], [t("dash.wf.direct"), -Number(p.direct), "bad"], [t("dash.wf.selling"), -Number(p.selling), "bad"], [t("dash.wf.admin"), -(Number(p.admin) + Number(p.other)), "bad"], [t("dash.wf.net"), Number(p.net), "ok"]];
  const max = Math.max(1, ...wf.map(([, v]) => Math.abs(v)));
  const total = c.accounts.reduce((s, a) => s + Number(a.balance), 0), adv = c.advances.reduce((s, h) => s + Number(h.balance), 0);
  return (
    <>
      {todo.length > 0 && (
        <Card title={t("dash.todoTitle")} icon="check" sub={t("dash.todoSub")} className="attn" extra={<Chip tone="warn">{todo.length}</Chip>}>
          <ul className="inbox">{todo.map((x, i) => (
            <li key={i} className={x.tone}><span className="ib-ico"><Icon name={x.icon} /></span><div className="ib-txt"><b>{x.title}</b><small>{x.sub}</small></div>
              {x.href ? <Link className={`btn sm ${x.tone === "bad" ? "" : "ghost"}`} href={x.href}>{x.btn}</Link>
                : <button className={`btn sm ${x.tone === "bad" ? "" : "ghost"}`} onClick={() => x.tab && go(x.tab)}>{x.btn}</button>}</li>
          ))}</ul>
        </Card>
      )}
      <div className="kpis">
        <KpiTile label={t("dash.netToDate")} value={money(p.net)} sub={t("dash.netSub")} icon="trend" tone="ok" onClick={() => go("pnl")} />
        <KpiTile label={t("dash.wf.revenue")} value={money(p.revenue)} sub={serverText(p.label)} icon="handshake" onClick={() => go("pnl")} />
        <KpiTile label={t("dash.sellingAdmin")} value={money(d(sa))} sub={t("dash.sellingAdminSub", { selling: short(p.selling), admin: short(d(Number(p.admin) + Number(p.other))) })} icon="wallet" tone="warn" onClick={() => go("pnl")} />
        <KpiTile label={t("common.employeeAdvances")} value={money(d(adv))} sub={t("dash.advancesSub")} icon="users" onClick={() => setAdvances(true)} />
      </div>
      <div className="cols wide">
        {showsMoney && <Card title={t("dash.wfTitle")} icon="chart" sub={t("dash.wfSub")}>
          <div className="waterfall">{wf.map(([l, v, tone]) => (
            <div key={l} className="wf"><span>{l}</span><div className={`wf-bar ${tone}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} /><b className="num">{short(v.toFixed(2))}</b></div>
          ))}</div>
        </Card>}
        <Card title={t("dash.safesTitle")} icon="bank" extra={<Chip tone="acc">{money(d(total))}</Chip>}>
          {c.accounts.map((a) => (
            <div key={a.id} className="acct click" onClick={() => setLedger(a.id)}><Icon name={a.kind === "treasury" ? "wallet" : "bank"} /><span className="spacer">{serverText(a.name)}<small>{a.code}</small></span><b className="num">{money(a.balance)}</b></div>
          ))}
          <button className="btn ghost" onClick={() => setAdvances(true)}><Icon name="users" />{t("common.employeeAdvances")} · {money(d(adv))}</button>
        </Card>
      </div>
      {periods.data && <div className="kpis sm">{periods.data.slice(-3).map((x) => <KpiTile key={x.month} label={serverText(x.label)} value={serverText(x.statusLabel)} sub={x.status === "open" ? t("dash.periodOpen") : t("dash.periodClosed")} icon={x.status === "open" ? "clock" : "lock"} tone={x.status === "open" ? "warn" : "ok"} />)}</div>}
      {advances && (
        <Modal title={t("common.employeeAdvances")} onClose={() => setAdvances(false)}>
          <Table head={[t("common.code"), t("common.employee"), t("dash.owesNow")]} empty={t("common.noAdvances")} onRow={(i) => { setAdvances(false); setLedger(c.advances[i]!.accountId); }}
            rows={c.advances.map((h) => [<span key="c" className="mono">{h.code}</span>, h.name, money(h.balance)])} />
        </Modal>
      )}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
