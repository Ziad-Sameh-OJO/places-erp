"use client";
import { useState } from "react";
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
  const [tab, setTab] = useState<Tab>("att");
  return (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[["att", "حضور النهارده"], ["history", "التاريخ"], ["delay", "Weekly Delay"], ["leaves", "الإجازات"], ["balances", "أرصدة الإجازات"], ["care", "الجزاءات و1-to-1"], ["saving", "التوفير"], ["emps", "الموظفين"]]} />
      {tab === "att" ? <AttendanceToday /> : tab === "history" ? <AttendanceHistory /> : tab === "delay" ? <WeeklyDelay /> : tab === "leaves" ? <Leaves /> : tab === "balances" ? <LeaveBalances /> : tab === "care" ? <PeopleCare /> : tab === "saving" ? <><Deductions /><IdealEmployee /></> : <Employees />}
    </>
  );
}
