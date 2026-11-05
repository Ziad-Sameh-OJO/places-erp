"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitDetail } from "@places/contracts";
import { Chip, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * 2.8 · 2.23 · the demo's «PDF & slide» tab: the PDF and the slide in the client's design, each also as PowerPoint (made
 * by the system from the sheet and the Pic & Info photos, nobody edits them), and Manar's «Confirm وانشره للسيلز» (Q15).
 * Any edit sends it back (Q19).
 */
export function UnitPdfTab({ u, canConfirm }: { u: UnitDetail; canConfirm: boolean }) {
  const qc = useQueryClient();
  const base = `/api/v1/inventory/units/${u.id}`;
  const run = useAction();
  const confirm = () => void run(async () => {
    await api.post(`/inventory/units/${u.id}/pdf/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, "الـ PDF اترفع، والتسويق والسيلز وصلهم إشعار");
  return (
    <>
      <div className="row">
        <a className="btn" href={`${base}/pdf`} target="_blank" rel="noopener noreferrer"><Icon name="file" />افتح الـ PDF</a>
        <a className="btn ghost" href={`${base}/pdf/pptx`}><Icon name="download" />الـ PDF كـ PowerPoint</a>
        <a className="btn ghost" href={`${base}/slide`} target="_blank" rel="noopener noreferrer"><Icon name="board" />افتح الـ slide</a>
        <a className="btn ghost" href={`${base}/slide/pptx`}><Icon name="download" />الـ slide كـ PowerPoint</a>
      </div>
      <Note>الـ PDF والـ slide بيتعملوا أوتوماتيك بنفس تصميم Places: الغلاف والجدول من بيانات الوحدة، والصور من فولدر Pic &amp; Info (أول صورة هي صورة المبنى، والباقي صور من جوه). محدش بيعدّل عليهم بإيده: أي تعديل في البيانات أو الصور بيظهر فيهم على طول، والوحدة بترجع تستنى Confirm منار. والوحدة مابتظهرش للسيلز غير بعد الـ Confirm.</Note>
      {u.pdfStatus === "draft" && canConfirm
        ? <button className="btn" onClick={confirm}><Icon name="check" />Confirm وانشره للسيلز</button>
        : u.pdfStatus === "draft" ? <Chip tone="warn">مستني Confirm من منار</Chip> : <Chip tone="ok">منشور للسيلز</Chip>}
    </>
  );
}
