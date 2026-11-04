"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { Budget } from "./budget";
import { Cash } from "./cash";
import { ChartTree } from "./chart-tree";
import { Custody } from "./custody";
import { Journal } from "./journal";

type Tab = "cash" | "custody" | "journal" | "budget" | "tree";

/** M-07 · المالية, the demo's tabs that are built: the safes and moves (9.2 · 9.11), custody and advances (9.3), the journal (9.5), the budget and the chart (9.1). */
export function FinanceView() {
  const [tab, setTab] = useState<Tab>("cash");
  return (
    <>
      <Tabs items={[["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"], ["budget", "البادجت"], ["tree", "شجرة الحسابات"]]} value={tab} onChange={setTab} />
      {tab === "cash" ? <Cash /> : tab === "custody" ? <Custody /> : tab === "journal" ? <Journal /> : tab === "budget" ? <Budget /> : <ChartTree />}
    </>
  );
}
