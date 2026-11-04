"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { Bills } from "./bills";
import { Budget } from "./budget";
import { Cash } from "./cash";
import { ChartTree } from "./chart-tree";
import { Custody } from "./custody";
import { Dashboard, type FinanceTab } from "./dashboard";
import { Journal } from "./journal";
import { BalanceSheet, IncomeStatement } from "./statements";
import { useBills, useBudget } from "./use-finance";

/** M-07 · المالية: the demo's tabs that are built so far (9.1 · 9.2 · 9.3 · 9.4 · 9.5 · 9.7 · 9.8 · 9.9 · 9.11 · 9.13 · 9.16). */
export function FinanceView() {
  const [tab, setTab] = useState<FinanceTab>("dash");
  const bills = useBills(), budget = useBudget();
  const go = (t: FinanceTab) => { setTab(t); window.scrollTo({ top: 0 }); };
  const body = { dash: <Dashboard go={go} />, cash: <Cash />, custody: <Custody />, journal: <Journal />, bills: <Bills />, pnl: <IncomeStatement />, bs: <BalanceSheet />, budget: <Budget />, tree: <ChartTree /> }[tab];
  return (
    <>
      <Tabs<FinanceTab> value={tab} onChange={go} items={[
        ["dash", "Dashboard"], ["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"],
        ["bills", "الفواتير الثابتة", bills.data?.due || undefined], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"],
        ["budget", "البادجت", budget.data?.totals.alerts || undefined], ["tree", "شجرة الحسابات"],
      ]} />
      {body}
    </>
  );
}
