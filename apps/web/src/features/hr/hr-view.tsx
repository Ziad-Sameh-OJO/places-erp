"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { AttendanceHistory, AttendanceToday, WeeklyDelay } from "./attendance";
import { Employees } from "./employees";
import { LeaveBalances, Leaves } from "./leaves";

type Tab = "att" | "history" | "delay" | "leaves" | "balances" | "emps";

/** M-05 · الموارد البشرية: the demo's tabs that are built (7.1 · 7.2 · 7.5 · 7.6 · 7.10 · 7.12). */
export function HrView() {
  const [tab, setTab] = useState<Tab>("att");
  return (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[["att", "حضور النهارده"], ["history", "التاريخ"], ["delay", "Weekly Delay"], ["leaves", "الإجازات"], ["balances", "أرصدة الإجازات"], ["emps", "الموظفين"]]} />
      {tab === "att" ? <AttendanceToday /> : tab === "history" ? <AttendanceHistory /> : tab === "delay" ? <WeeklyDelay /> : tab === "leaves" ? <Leaves /> : tab === "balances" ? <LeaveBalances /> : <Employees />}
    </>
  );
}
