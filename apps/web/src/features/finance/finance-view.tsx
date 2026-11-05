"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { Bills } from "./bills";
import { Claims, claimsWaiting, useClaims } from "./claims";
import { Budget } from "./budget";
import { Cash } from "./cash";
import { ChartTree } from "./chart-tree";
import { Custody } from "./custody";
import { Dashboard, type FinanceTab } from "./dashboard";
import { Journal } from "./journal";
import { Payroll } from "./payroll";
import { BalanceSheet, IncomeStatement } from "./statements";
import { useBills, useBudget } from "./use-finance";

/** M-07 · المالية: the demo's tabs that are built so far (9.1 · 9.2 · 9.3 · 9.4 · 9.5 · 9.7 · 9.8 · 9.9 · 9.11 · 9.13 · 9.14 · 9.16 · 9.17). */
export function FinanceView() {
  const [tab, setTab] = useState<FinanceTab>("dash");
  const bills = useBills(), budget = useBudget(), claims = useClaims();
  const go = (t: FinanceTab) => { setTab(t); window.scrollTo({ top: 0 }); };
  const body = { dash: <Dashboard go={go} />, cash: <Cash />, custody: <Custody />, journal: <Journal />, bills: <Bills />, claims: <Claims />, pnl: <IncomeStatement />, bs: <BalanceSheet />, budget: <Budget />, payroll: <Payroll />, tree: <ChartTree /> }[tab];
  return (
    <>
      <Tabs<FinanceTab> value={tab} onChange={go} items={[
        ["dash", "Dashboard"], ["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"],
        ["bills", "الفواتير الثابتة", bills.data?.due || undefined], ["claims", "المطالبات", claimsWaiting(claims.data) || undefined], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"],
        ["budget", "البادجت", budget.data?.totals.alerts || undefined], ["payroll", "المرتبات"], ["tree", "شجرة الحسابات"],
      ]} />
      {body}
    </>
  );
}
