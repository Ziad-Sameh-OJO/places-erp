"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PeriodView } from "@places/contracts";
import { Card, Chip, Empty, Icon, Modal, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import type { IconName } from "@places/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money, short } from "@/lib/format";
import { useBills, useBudget, useCash, useIncome, usePayroll } from "./use-finance";
import { LedgerModal } from "./ledger-modal";

export type FinanceTab = "dash" | "cash" | "custody" | "journal" | "bills" | "claims" | "pnl" | "bs" | "budget" | "payroll" | "tree";
interface Todo { tone: "warn" | "bad"; icon: IconName; title: string; sub: string; tab: FinanceTab; btn: string }

/**
 * 9.4 · داشبورد المالية (M-07 5.1 + the client's request): «مستنيك النهارده» on top (the same items as the home page),
 * net profit to date and its stages from the same numbers as the income statement (9.7), the safes and banks, and the
 * employees' advances (a click shows each balance).
 */
export function Dashboard({ go }: { go: (t: FinanceTab) => void }) {
  const { can } = useMe();
  const year = useIncome("year"), cash = useCash(), bills = useBills(), budget = useBudget(), payroll = usePayroll();
  const periods = useQuery({ queryKey: ["finance", "periods"], queryFn: () => api.get<PeriodView[]>("/finance/periods") });
  const [advances, setAdvances] = useState(false);
  const [ledger, setLedger] = useState<string | null>(null);
  if (!year.data || !cash.data) return <Empty text="بيحمّل…" icon="clock" />;
  const p = year.data, c = cash.data;
  const todo: Todo[] = [];
  if (can("finance", "create")) {
    const pr = payroll.data;
    if (pr?.due && pr.rows.length) todo.push({ tone: "warn", icon: "wallet", title: `اصرف مرتبات ${pr.label}`, sub: `${pr.totals.people} موظف · صافي ${money(pr.totals.net)} · مرة واحدة`, tab: "payroll", btn: "افتح" });
    for (const b of bills.data?.items.filter((x) => x.state === "due") ?? []) todo.push({ tone: "warn", icon: "calendar", title: `ميعاد فاتورة ${b.name}`, sub: `${money(b.amount)} · ${b.vendor} · مستنية موافقتك`, tab: "cash", btn: "افتح" });
    for (const r of budget.data?.rows.filter((x) => x.level === "bad" || x.level === "warn") ?? [])
      todo.push({ tone: r.level === "bad" ? "bad" : "warn", icon: "wallet", title: r.level === "bad" ? `بند «${r.name}» عدّى البادجت` : `بند «${r.name}» قرّب يخلص`, sub: `اتصرف ${money(r.spent)} من ${money(r.budget ?? "0")}`, tab: "budget", btn: "افتح" });
  }
  const sa = Number(p.selling) + Number(p.admin) + Number(p.other);
  const wf: [string, number, "acc" | "bad" | "ok"][] = [["الإيرادات", Number(p.revenue), "acc"], ["مصاريف مباشرة", -Number(p.direct), "bad"], ["مصاريف بيعية", -Number(p.selling), "bad"], ["مصاريف إدارية", -(Number(p.admin) + Number(p.other)), "bad"], ["صافي الربح", Number(p.net), "ok"]];
  const max = Math.max(1, ...wf.map(([, v]) => Math.abs(v)));
  const total = c.accounts.reduce((s, a) => s + Number(a.balance), 0), adv = c.advances.reduce((s, h) => s + Number(h.balance), 0);
  return (
    <>
      {todo.length > 0 && (
        <Card title="مستنيك النهارده" icon="check" sub="المرتبات والفواتير الثابتة والبنود اللي عدّت البادجت" className="attn" extra={<Chip tone="warn">{todo.length}</Chip>}>
          <ul className="inbox">{todo.map((x, i) => (
            <li key={i} className={x.tone}><span className="ib-ico"><Icon name={x.icon} /></span><div className="ib-txt"><b>{x.title}</b><small>{x.sub}</small></div>
              <button className={`btn sm ${x.tone === "bad" ? "" : "ghost"}`} onClick={() => go(x.tab)}>{x.btn}</button></li>
          ))}</ul>
        </Card>
      )}
      <div className="kpis">
        <KpiTile label="صافي الربح لحد النهارده" value={money(p.net)} sub="إيرادات − مباشرة − بيعية − إدارية" icon="trend" tone="ok" onClick={() => go("pnl")} />
        <KpiTile label="الإيرادات" value={money(p.revenue)} sub={p.label} icon="handshake" onClick={() => go("pnl")} />
        <KpiTile label="المصاريف البيعية والإدارية" value={money(sa.toFixed(2))} sub={`بيعية ${short(p.selling)} · إدارية ${short((Number(p.admin) + Number(p.other)).toFixed(2))}`} icon="wallet" tone="warn" onClick={() => go("pnl")} />
        <KpiTile label="سلف الموظفين" value={money(adv.toFixed(2))} sub="دوس تشوف الأرصدة" icon="users" onClick={() => setAdvances(true)} />
      </div>
      <div className="cols wide">
        <Card title="من الإيرادات لصافي الربح" icon="chart" sub="على مراحل زي ما د. علي بيحسبه · نفس أرقام قايمة الدخل">
          <div className="waterfall">{wf.map(([l, v, tone]) => (
            <div key={l} className="wf"><span>{l}</span><div className={`wf-bar ${tone}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} /><b className="num">{short(v.toFixed(2))}</b></div>
          ))}</div>
        </Card>
        <Card title="رصيد الخزن والبنوك" icon="bank" extra={<Chip tone="acc">{money(total.toFixed(2))}</Chip>}>
          {c.accounts.map((a) => (
            <div key={a.id} className="acct click" onClick={() => setLedger(a.id)}><Icon name={a.kind === "treasury" ? "wallet" : "bank"} /><span className="spacer">{a.name}<small>{a.code}</small></span><b className="num">{money(a.balance)}</b></div>
          ))}
          <button className="btn ghost" onClick={() => setAdvances(true)}><Icon name="users" />سلف الموظفين · {money(adv.toFixed(2))}</button>
        </Card>
      </div>
      {periods.data && <div className="kpis sm">{periods.data.slice(-3).map((x) => <KpiTile key={x.month} label={x.label} value={x.statusLabel} sub={x.status === "open" ? "الحركات بتتسجّل" : "اتقفل"} icon={x.status === "open" ? "clock" : "lock"} tone={x.status === "open" ? "warn" : "ok"} />)}</div>}
      {advances && (
        <Modal title="سلف الموظفين" onClose={() => setAdvances(false)}>
          <Table head={["الكود", "الموظف", "عليه دلوقتي"]} empty="مفيش سلف" onRow={(i) => { setAdvances(false); setLedger(c.advances[i]!.accountId); }}
            rows={c.advances.map((h) => [<span key="c" className="mono">{h.code}</span>, h.name, money(h.balance)])} />
        </Modal>
      )}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
