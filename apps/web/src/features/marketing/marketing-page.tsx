"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui";
import { Broadcast, useBroadcasts } from "./broadcast";
import { Campaigns } from "./campaigns";
import { ContentPlan } from "./content-plan";
import { Dashboard } from "./dashboard";
import { DoneDeals, useMarketingDeals } from "./done-deals";
import { NewUnits, useNewUnits } from "./new-units";
import { useCampaigns } from "./use-campaigns";

type Tab = "dash" | "camps" | "content" | "broadcast" | "units" | "deals";
const TABS: readonly Tab[] = ["dash", "camps", "content", "broadcast", "units", "deals"];

/** M-04 · التسويق (demo marketing.js): dashboard (4.6), campaigns (4.5), Content plan (4.7), Broadcast (4.8), new units (4.4), Done Deals (4.9). */
export function MarketingPage() {
  const t = useTranslations("marketing.tabs");
  const [tab, setTab] = useState<Tab>("dash");
  const campaigns = useCampaigns().data;
  const units = useNewUnits().data;
  const broadcasts = useBroadcasts().data;
  const deals = useMarketingDeals().data;
  // a Reminder links to /marketing?tab=content, a Live Alert to ?tab=units, a Done Deal alarm to ?tab=deals
  useEffect(() => { const q = new URLSearchParams(window.location.search).get("tab"); if (TABS.includes(q as Tab)) setTab(q as Tab); }, []);
  return (
    <>
      <div className="row">
        <Tabs value={tab} onChange={setTab} items={[
          ["dash", "Dashboard"], ["camps", t("camps"), campaigns?.length], ["content", "Content plan"],
          ["broadcast", "Broadcast", broadcasts?.items.length], ["units", t("units"), units?.length], ["deals", t("deals"), deals?.total],
        ]} />
      </div>
      {tab === "dash" && <Dashboard />}
      {tab === "camps" && <Campaigns />}
      {tab === "content" && <ContentPlan />}
      {tab === "broadcast" && <Broadcast />}
      {tab === "units" && <NewUnits />}
      {tab === "deals" && <DoneDeals />}
    </>
  );
}
