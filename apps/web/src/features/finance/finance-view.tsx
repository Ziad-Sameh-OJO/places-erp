"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { ChartTree } from "./chart-tree";
import { Journal } from "./journal";

/** M-07 · المالية: the chart of accounts (9.1) and the journal (9.5). The other tabs come with their tasks. */
export function FinanceView() {
  const [tab, setTab] = useState<"coa" | "journal">("coa");
  return (
    <>
      <Tabs items={[["coa", "شجرة الحسابات"], ["journal", "القيود"]]} value={tab} onChange={setTab} />
      {tab === "coa" ? <ChartTree /> : <Journal />}
    </>
  );
}
