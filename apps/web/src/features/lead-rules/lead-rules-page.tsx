"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { useMe } from "@/lib/me";
import { RoutingTab } from "./routing-tab";

type Tab = "routing";

/** Demo «قواعد الليدز والتوزيع» (module «settings»): the routing (1.12); the timing and people tabs come with 1.29. */
export function LeadRulesPage() {
  const { can } = useMe();
  const [tab, setTab] = useState<Tab>("routing");
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["routing", "التوزيع"]]} /></div>
      {tab === "routing" && <RoutingTab editable={can("settings", "edit")} />}
    </>
  );
}
