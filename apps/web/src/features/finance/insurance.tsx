"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { InsuranceView } from "@places/contracts";
import { Card, Chip, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { money } from "./money";

/** M-05 · the insurance HR recorded (HR, 15 Nov), read-only for Finance: what payroll deducts each month. */
export function FinanceInsurance() {
  const t = useTranslations("finance");
  const d = useQuery({ queryKey: ["finance", "insurance"], queryFn: () => api.get<InsuranceView>("/finance/insurance") }).data;
  if (!d) return null;
  return (
    <Card title={t("insurance.title")} icon="id" sub={t("insurance.sub")} extra={<Chip plain>{money(d.totals.monthly)}</Chip>}>
      <Table head={[t("common.employee"), t("insurance.provider"), t("insurance.since"), t("insurance.monthly"), t("insurance.companyShare")]} empty={t("insurance.empty")}
        rows={d.items.map((r) => [<b key="n">{r.name}</b>, serverText(r.provider), r.since ?? "—", money(r.monthly), r.companyShare ? money(r.companyShare) : "—"])} />
    </Card>
  );
}
