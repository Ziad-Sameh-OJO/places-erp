"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Icon, ImportDialog } from "@/components/ui";

type ImportsT = ReturnType<typeof useTranslations<"imports">>;
/**
 * 13.1 · the old data's templates: the columns shown in the preview (the API's template has them all). The words are
 * in imports.<kind> (button, title, the template's file name, columns).
 */
const KINDS = {
  units: (t: ImportsT): [string, string][] => (["type", "project", "area", "space", "building", "ownerName", "ownerPhone", "pricePerSqm"] as const).map((c) => [c, t(`units.columns.${c}`)]),
  leads: (t: ImportsT): [string, string][] => (["name", "phones", "area", "type", "channel", "arrivedAt"] as const).map((c) => [c, t(`leads.columns.${c}`)]),
  companies: (t: ImportsT): [string, string][] => (["name", "category", "number", "contactName", "contractEnd"] as const).map((c) => [c, t(`companies.columns.${c}`)]),
};

/** The toolbar button and its dialog: template → preview (new / duplicate / errors) → «تأكيد» adds the new rows only. */
export function OldDataImport({ kind, label }: { kind: keyof typeof KINDS; label?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const t = useTranslations("imports");
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="upload" />{label ?? t(`${kind}.button`)}</button>
      {open && <ImportDialog<Record<string, unknown>> title={t(`${kind}.title`)} path={`/imports/${kind}`} template={t(`${kind}.template`)} columns={KINDS[kind](t)} skipErrors
        onClose={() => setOpen(false)} onDone={() => { setOpen(false); void qc.invalidateQueries(); }} />}
    </>
  );
}
