"use client";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui";
import { Broadcast, useBroadcasts } from "./broadcast";
import { Campaigns } from "./campaigns";
import { ContentPlan } from "./content-plan";
import { Dashboard } from "./dashboard";
import { NewUnits, useNewUnits } from "./new-units";
import { useCampaigns } from "./use-campaigns";

type Tab = "dash" | "camps" | "content" | "broadcast" | "units";
const TABS: readonly Tab[] = ["dash", "camps", "content", "broadcast", "units"];

/** M-04 · التسويق (demo marketing.js): dashboard (4.6), campaigns (4.5), Content plan (4.7), Broadcast (4.8), new units (4.4). */
export function MarketingPage() {
  const [tab, setTab] = useState<Tab>("dash");
  const campaigns = useCampaigns().data;
  const units = useNewUnits().data;
  const broadcasts = useBroadcasts().data;
  // a Reminder links to /marketing?tab=content, a Live Alert to ?tab=units
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (TABS.includes(t as Tab)) setTab(t as Tab); }, []);
  return (
    <>
      <div className="row">
        <Tabs value={tab} onChange={setTab} items={[
          ["dash", "Dashboard"], ["camps", "الكامبينز", campaigns?.length], ["content", "Content plan"],
          ["broadcast", "Broadcast", broadcasts?.items.length], ["units", "وحدات جديدة", units?.length],
        ]} />
      </div>
      {tab === "dash" && <Dashboard />}
      {tab === "camps" && <Campaigns />}
      {tab === "content" && <ContentPlan />}
      {tab === "broadcast" && <Broadcast />}
      {tab === "units" && <NewUnits />}
    </>
  );
}
