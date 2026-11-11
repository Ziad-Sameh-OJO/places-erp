"use client";
import { useQuery } from "@tanstack/react-query";
import type { MarketingDeal, Paged } from "@places/contracts";
import { Note, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useTranslations } from "next-intl";
import { CompanyProfileCard, DealLogoCell, useCompanyProfileAdmin } from "./company-profile";

const KEY = ["marketing-deals"];
// the demo lists every Done Deal on one page; 100 is the API's page cap
export const useMarketingDeals = () => useQuery({ queryKey: KEY, queryFn: () => api.get<Paged<MarketingDeal>>("/deals/marketing?pageSize=100") });

/**
 * The demo's «الصفقات» tab (4.9 · M-02 2.1 (7) · Q26): a Done Deal shows here once the Office Manager approves it,
 * with only the allowed fields — the Buyer, company, type, space and location. The logo is back for the Company Profile
 * (client, 11 Nov): uploaded on the deal, Done = on its «عملاؤنا» page at the next Update.
 */
export function DoneDeals() {
  const t = useTranslations("marketing.deals");
  const deals = useMarketingDeals();
  const logos = useCompanyProfileAdmin().data?.logos ?? {};
  return (
    <>
      <CompanyProfileCard />
      <Note>{t("note")}</Note>
      {deals.error && <Note kind="warn">{deals.error.message}</Note>}
      <Table
        head={[t("head.buyer"), t("head.company"), "Type", t("head.space"), "Location", t("head.logo")]}
        empty={t("empty")}
        rows={(deals.data?.items ?? []).map((d) => [
          <b key="b">{d.buyer}</b>, d.company || "—", d.type || "—", <span key="s" className="n">{t("space", { space: num(d.space) })}</span>, d.location || "—",
          <DealLogoCell key="l" dealId={d.id} logo={logos[d.id]} company={d.company || d.buyer} />,
        ])}
      />
    </>
  );
}
