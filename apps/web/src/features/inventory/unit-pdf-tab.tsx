"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitDetail } from "@places/contracts";
import { Chip, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * 2.8 · 2.23 · the demo's «PDF & slide» tab: the PDF and the slide in the client's design, each also as PowerPoint (made
 * by the system from the sheet and the Pic & Info photos, nobody edits them), and Manar's «Confirm وانشره للسيلز» (Q15).
 * Any edit sends it back (Q19).
 */
export function UnitPdfTab({ u, canConfirm }: { u: UnitDetail; canConfirm: boolean }) {
  const t = useTranslations("inventory.pdf");
  const qc = useQueryClient();
  const base = `/api/v1/inventory/units/${u.id}`;
  const run = useAction();
  const confirm = () => void run(async () => {
    await api.post(`/inventory/units/${u.id}/pdf/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, t("published"));
  return (
    <>
      <div className="row">
        <a className="btn" href={`${base}/pdf`} target="_blank" rel="noopener noreferrer"><Icon name="file" />{t("openPdf")}</a>
        <a className="btn ghost" href={`${base}/pdf/pptx`}><Icon name="download" />{t("pdfPptx")}</a>
        <a className="btn ghost" href={`${base}/slide`} target="_blank" rel="noopener noreferrer"><Icon name="board" />{t("openSlide")}</a>
        <a className="btn ghost" href={`${base}/slide/pptx`}><Icon name="download" />{t("slidePptx")}</a>
      </div>
      <Note>{t("note")}</Note>
      {u.pdfStatus === "draft" && canConfirm
        ? <button className="btn" onClick={confirm}><Icon name="check" />{t("confirm")}</button>
        : u.pdfStatus === "draft" ? <Chip tone="warn">{t("waiting")}</Chip> : <Chip tone="ok">{t("published2")}</Chip>}
    </>
  );
}
