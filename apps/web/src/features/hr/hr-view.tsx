"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { AttendanceHistory, AttendanceToday, WeeklyDelay } from "./attendance";
import { Employees } from "./employees";

type Tab = "att" | "history" | "delay" | "emps";

/** M-05 · الموارد البشرية: the demo's tabs that are built (7.1 · 7.2 · 7.10 · 7.12). */
export function HrView() {
  const [tab, setTab] = useState<Tab>("att");
  return (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[["att", "حضور النهارده"], ["history", "التاريخ"], ["delay", "Weekly Delay"], ["emps", "الموظفين"]]} />
      {tab === "att" ? <AttendanceToday /> : tab === "history" ? <AttendanceHistory /> : tab === "delay" ? <WeeklyDelay /> : <Employees />}
    </>
  );
}
