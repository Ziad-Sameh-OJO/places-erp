"use client";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui";
import { Campaigns } from "./campaigns";
import { ContentPlan } from "./content-plan";
import { Dashboard } from "./dashboard";
import { NewUnits, useNewUnits } from "./new-units";
import { useCampaigns } from "./use-campaigns";

type Tab = "dash" | "camps" | "content" | "units";
const TABS: readonly Tab[] = ["dash", "camps", "content", "units"];

/** M-04 · التسويق (demo marketing.js): the dashboard (4.6), the campaigns (4.5), the Content plan (4.7), new units (4.4). */
export function MarketingPage() {
  const [tab, setTab] = useState<Tab>("dash");
  const campaigns = useCampaigns().data;
  const units = useNewUnits().data;
  // a Reminder links to /marketing?tab=content
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (TABS.includes(t as Tab)) setTab(t as Tab); }, []);
  return (
    <>
      <div className="row">
        <Tabs value={tab} onChange={setTab} items={[["dash", "Dashboard"], ["camps", "الكامبينز", campaigns?.length], ["content", "Content plan"], ["units", "وحدات جديدة", units?.length]]} />
      </div>
      {tab === "dash" && <Dashboard />}
      {tab === "camps" && <Campaigns />}
      {tab === "content" && <ContentPlan />}
      {tab === "units" && <NewUnits />}
    </>
  );
}
