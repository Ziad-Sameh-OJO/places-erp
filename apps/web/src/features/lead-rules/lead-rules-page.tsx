"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Note, Tabs } from "@/components/ui";
import { useMe } from "@/lib/me";
import { RoutingTab } from "./routing-tab";
import { RulesTabs, type RulesTab } from "./rules-tabs";

type Tab = "routing" | RulesTab;

/** Demo «قواعد الليدز والتوزيع» (module «settings»): the routing (1.12) and every timing and person responsible (1.29). */
export function LeadRulesPage() {
  const t = useTranslations("leadRules.page");
  const { can } = useMe();
  const [tab, setTab] = useState<Tab>("routing");
  const edit = can("settings", "edit");
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[["routing", t("routing")], ["sla", t("sla")], ["na", "No Answer"], ["draft", "Draft"], ["visit", t("visit")], ["close", t("close")]]} />
      {tab === "routing" ? <RoutingTab editable={edit} /> : <>{!edit && <Note>{t("viewOnly")}</Note>}<RulesTabs tab={tab} editable={edit} /></>}
    </>
  );
}
