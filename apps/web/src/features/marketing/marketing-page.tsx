"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { Campaigns } from "./campaigns";
import { Dashboard } from "./dashboard";
import { useCampaigns } from "./use-campaigns";

type Tab = "dash" | "camps";

/** M-04 · التسويق (demo marketing.js): the tabs as they are built — the dashboard (4.6) and the campaigns (4.5). */
export function MarketingPage() {
  const [tab, setTab] = useState<Tab>("dash");
  const campaigns = useCampaigns().data;
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["dash", "Dashboard"], ["camps", "الكامبينز", campaigns?.length]]} /></div>
      {tab === "dash" && <Dashboard />}
      {tab === "camps" && <Campaigns />}
    </>
  );
}
