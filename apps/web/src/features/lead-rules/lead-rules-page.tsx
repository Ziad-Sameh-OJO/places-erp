"use client";
import { useState } from "react";
import { Note, Tabs } from "@/components/ui";
import { useMe } from "@/lib/me";
import { RoutingTab } from "./routing-tab";
import { RulesTabs, type RulesTab } from "./rules-tabs";

type Tab = "routing" | RulesTab;

/** Demo «قواعد الليدز والتوزيع» (module «settings»): the routing (1.12) and every timing and person responsible (1.29). */
export function LeadRulesPage() {
  const { can } = useMe();
  const [tab, setTab] = useState<Tab>("routing");
  const edit = can("settings", "edit");
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[["routing", "التوزيع"], ["sla", "المواعيد والـ SLA"], ["na", "No Answer"], ["draft", "Draft"], ["visit", "Visit و Meeting"], ["close", "الإقفال"]]} />
      {tab === "routing" ? <RoutingTab editable={edit} /> : <>{!edit && <Note>عرض بس · التعديل محتاج صلاحية «يعدّل» على إعدادات التوزيع</Note>}<RulesTabs tab={tab} editable={edit} /></>}
    </>
  );
}
