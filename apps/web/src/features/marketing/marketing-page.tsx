"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { Campaigns } from "./campaigns";
import { useCampaigns } from "./use-campaigns";

type Tab = "camps";

/** M-04 · التسويق (demo marketing.js): the tabs as they are built — the campaigns (4.5) so far. */
export function MarketingPage() {
  const [tab, setTab] = useState<Tab>("camps");
  const campaigns = useCampaigns().data;
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["camps", "الكامبينز", campaigns?.length]]} /></div>
      {tab === "camps" && <Campaigns />}
    </>
  );
}
