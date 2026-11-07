"use client";
import { useTranslations } from "next-intl";
import { Note } from "@/components/ui";
import { Purchases } from "@/features/procurement/purchases";
import { CustodyCard } from "@/features/procurement/custody-card";
import { OfficeCards } from "@/features/procurement/office-assets";

/** M-08 · المشتريات, as the demo lays it out: the requests and the budget (10.1–10.3), then the office cards (10.4). */
export default function ProcurementPage() {
  const t = useTranslations("pages.procurement");
  return (
    <>
      <Purchases />
      <OfficeCards lead={<CustodyCard />} />
      <Note>{t("budgetNote")}</Note>
    </>
  );
}
