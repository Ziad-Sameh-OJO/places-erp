"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui";
import { Bills } from "./bills";
import { Claims, claimsWaiting, useClaims } from "./claims";
import { Budget } from "./budget";
import { Cash } from "./cash";
import { ChartTree } from "./chart-tree";
import { Custody } from "./custody";
import { CostCenter } from "./cost-center";
import { Dashboard, type FinanceTab } from "./dashboard";
import { Journal } from "./journal";
import { Payroll } from "./payroll";
import { BalanceSheet, IncomeStatement } from "./statements";
import { useBills, useBudget } from "./use-finance";

const TABS: readonly FinanceTab[] = ["dash", "cash", "custody", "journal", "bills", "claims", "pnl", "bs", "budget", "cost", "payroll", "tree"];

/** M-07 · المالية: the demo's tabs that are built so far (9.1 · 9.2 · 9.3 · 9.4 · 9.5 · 9.7 · 9.8 · 9.9 · 9.10 · 9.11 · 9.13 · 9.14 · 9.16 · 9.17). */
export function FinanceView() {
  const t = useTranslations("finance.tabs");
  const [tab, setTab] = useState<FinanceTab>("dash");
  const bills = useBills(), budget = useBudget(), claims = useClaims();
  const go = (t: FinanceTab) => { setTab(t); window.scrollTo({ top: 0 }); };
  // 9.19: a «مستنيك النهارده» line on the home page links to /finance?tab=… — open on that tab
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (t && TABS.includes(t as FinanceTab)) setTab(t as FinanceTab); }, []);
  const body = { dash: <Dashboard go={go} />, cash: <Cash />, custody: <Custody />, journal: <Journal />, bills: <Bills />, claims: <Claims />, pnl: <IncomeStatement />, bs: <BalanceSheet />, budget: <Budget />, cost: <CostCenter />, payroll: <Payroll />, tree: <ChartTree /> }[tab];
  return (
    <>
      <Tabs<FinanceTab> value={tab} onChange={go} items={[
        ["dash", t("dash")], ["cash", t("cash")], ["custody", t("custody")], ["journal", t("journal")],
        ["bills", t("bills"), bills.data?.due || undefined], ["claims", t("claims"), claimsWaiting(claims.data) || undefined], ["pnl", t("pnl")], ["bs", t("bs")],
        ["budget", t("budget"), budget.data?.totals.alerts || undefined], ["cost", t("cost")], ["payroll", t("payroll")], ["tree", t("tree")],
      ]} />
      {body}
    </>
  );
}
