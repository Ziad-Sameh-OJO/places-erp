"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, ImportDialog } from "@/components/ui";

/** 13.1 · the old data's templates: the columns shown in the preview (the API's template has them all). */
const KINDS = {
  units: { button: "استيراد Excel", title: "استيراد Excel (القالب الموحّد)", template: "قالب الوحدات.xlsx",
    columns: [["type", "Type"], ["project", "Project"], ["area", "Area"], ["space", "المساحة"], ["building", "رقم المبنى"], ["ownerName", "الاسم"], ["ownerPhone", "الرقم"], ["pricePerSqm", "السعر للمتر"]] },
  leads: { button: "ليدز قديمة (Excel)", title: "استيراد الليدز القديمة", template: "قالب الليدز القديمة.xlsx",
    columns: [["name", "الاسم"], ["phones", "الموبايل"], ["area", "Area"], ["type", "Type"], ["channel", "Channel"], ["arrivedAt", "التاريخ"]] },
  companies: { button: "شركات (Excel)", title: "استيراد أرشيف الشركات", template: "قالب الشركات.xlsx",
    columns: [["name", "اسم الشركة"], ["category", "الكاتيجوري"], ["number", "الرقم"], ["contactName", "اسم المسؤول"], ["contractEnd", "نهاية العقد"]] },
} satisfies Record<string, { button: string; title: string; template: string; columns: [string, string][] }>;

/** The toolbar button and its dialog: template → preview (new / duplicate / errors) → «تأكيد» adds the new rows only. */
export function OldDataImport({ kind }: { kind: keyof typeof KINDS }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const k = KINDS[kind];
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="upload" />{k.button}</button>
      {open && <ImportDialog<Record<string, unknown>> title={k.title} path={`/imports/${kind}`} template={k.template} columns={k.columns} skipErrors
        onClose={() => setOpen(false)} onDone={() => { setOpen(false); void qc.invalidateQueries(); }} />}
    </>
  );
}
