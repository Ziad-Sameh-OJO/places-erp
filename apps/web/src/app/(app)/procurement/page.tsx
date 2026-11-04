"use client";
import { Note } from "@/components/ui";
import { Purchases } from "@/features/procurement/purchases";
import { CustodyCard } from "@/features/procurement/custody-card";
import { OfficeCards } from "@/features/procurement/office-assets";

/** M-08 · المشتريات, as the demo lays it out: the requests and the budget (10.1–10.3), then the office cards (10.4). */
export default function ProcurementPage() {
  return (
    <>
      <Purchases />
      <OfficeCards lead={<CustodyCard />} />
      <Note>الفاضل في البند = Budget البند − اللي اتصرف عليه. مثال: Budget 100,000 واتصرف 65,000، يبقى فاضل 35,000. أي مصروف معتمد بيتحمّل على بنده في شجرة الحسابات في المالية.</Note>
    </>
  );
}
