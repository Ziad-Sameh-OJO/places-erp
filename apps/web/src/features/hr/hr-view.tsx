"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui";
import { AttendanceHistory, AttendanceToday, WeeklyDelay } from "./attendance";
import { Deductions } from "./deductions";
import { Employees } from "./employees";
import { EmployeeBox, IdealEmployee } from "./ideal";
import { LeaveBalances, Leaves } from "./leaves";
import { PeopleCare } from "./people-care";
import { Improvement, Warnings } from "./warnings";
import { useMe } from "@/lib/me";

type Tab = "att" | "history" | "delay" | "leaves" | "balances" | "care" | "saving" | "ideal" | "box" | "emps" | "warnings" | "improve";
const TABS: readonly Tab[] = ["att", "history", "delay", "leaves", "balances", "care", "saving", "ideal", "box", "emps", "warnings", "improve"];

/** M-05 · الموارد البشرية: the demo's tabs that are built (7.1 · 7.2 · 7.5 · 7.6 · 7.7 · 7.8 · 7.9 · 7.10 · 7.12). */
export function HrView() {
  const t = useTranslations("hr");
  const [tab, setTab] = useState<Tab>("att");
  const { can } = useMe();
  // «بحث سريع» (0.17) opens an employee's file: «/hr?employee=<id>» lands on «الموظفين»
  // «مهامي النهارده» (0.18) opens a tab: «/hr?tab=leaves» · «/hr?tab=att»
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("employee")) setTab("emps");
    else if (TABS.includes(q.get("tab") as Tab)) setTab(q.get("tab") as Tab);
  }, []);
  return (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[["att", t("tabs.att")], ["history", t("tabs.history")], ["delay", "Weekly Delay"], ["leaves", t("tabs.leaves")], ["balances", t("tabs.balances")], ["care", t("tabs.care")], ["saving", t("tabs.saving")], ["ideal", t("tabs.ideal")], ["box", t("tabs.box")], ["emps", t("tabs.emps")], ...(can("hr", "edit") ? [["warnings", t("warnings.tab")] as [Tab, string]] : []), ...(can("hr", "approve") ? [["improve", t("improvement.tab")] as [Tab, string]] : [])]} />
      {tab === "att" ? <AttendanceToday /> : tab === "history" ? <AttendanceHistory /> : tab === "delay" ? <WeeklyDelay /> : tab === "leaves" ? <Leaves /> : tab === "balances" ? <LeaveBalances /> : tab === "care" ? <PeopleCare /> : tab === "saving" ? <Deductions /> : tab === "ideal" ? <IdealEmployee /> : tab === "box" ? <EmployeeBox /> : tab === "warnings" ? <Warnings /> : tab === "improve" ? <Improvement /> : <Employees />}
    </>
  );
}
