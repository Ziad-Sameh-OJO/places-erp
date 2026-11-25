"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MarketingDeal, Paged } from "@places/contracts";
import { Note, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useTranslations } from "next-intl";
import { CompanyProfileCard, DealLogoCell, useCompanyProfileAdmin } from "./company-profile";

const KEY = ["marketing-deals"];
// 100 a page (the API's cap); past that, «التالي» — the demo's one page stopped showing the older deals
const PAGE_SIZE = 100;
export const useMarketingDeals = (page = 1) =>
  useQuery({ queryKey: [...KEY, page], queryFn: () => api.get<Paged<MarketingDeal>>(`/deals/marketing?pageSize=${PAGE_SIZE}&page=${page}`), placeholderData: keepPreviousData });

/**
 * The demo's «الصفقات» tab (4.9 · M-02 2.1 (7) · Q26): a Done Deal shows here once the Office Manager approves it,
 * with only the allowed fields — the Buyer, company, type, space and location. The logo is back for the Company Profile
 * (client, 11 Nov): uploaded on the deal, Done = on its «عملاؤنا» page at the next Update.
 */
export function DoneDeals() {
  const t = useTranslations("marketing.deals");
  const [page, setPage] = useState(1);
  const deals = useMarketingDeals(page);
  const pages = Math.max(1, Math.ceil((deals.data?.total ?? 0) / PAGE_SIZE));
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
      {pages > 1 && (
        <div className="row end">
          <button type="button" className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button type="button" className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
    </>
  );
}
