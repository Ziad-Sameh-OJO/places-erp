"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui";
import { AttendanceHistory, AttendanceToday, WeeklyDelay } from "./attendance";
import { Deductions } from "./deductions";
import { Employees } from "./employees";
import { IdealEmployee } from "./ideal";
import { LeaveBalances, Leaves } from "./leaves";
import { PeopleCare } from "./people-care";

type Tab = "att" | "history" | "delay" | "leaves" | "balances" | "care" | "saving" | "emps";

/** M-05 · الموارد البشرية: the demo's tabs that are built (7.1 · 7.2 · 7.5 · 7.6 · 7.7 · 7.8 · 7.9 · 7.10 · 7.12). */
export function HrView() {
  const t = useTranslations("hr");
  const [tab, setTab] = useState<Tab>("att");
  // «بحث سريع» (0.17) opens an employee's file: «/hr?employee=<id>» lands on «الموظفين»
  useEffect(() => { if (new URLSearchParams(window.location.search).get("employee")) setTab("emps"); }, []);
  return (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[["att", t("tabs.att")], ["history", t("tabs.history")], ["delay", "Weekly Delay"], ["leaves", t("tabs.leaves")], ["balances", t("tabs.balances")], ["care", t("tabs.care")], ["saving", t("tabs.saving")], ["emps", t("tabs.emps")]]} />
      {tab === "att" ? <AttendanceToday /> : tab === "history" ? <AttendanceHistory /> : tab === "delay" ? <WeeklyDelay /> : tab === "leaves" ? <Leaves /> : tab === "balances" ? <LeaveBalances /> : tab === "care" ? <PeopleCare /> : tab === "saving" ? <><Deductions /><IdealEmployee /></> : <Employees />}
    </>
  );
}
