"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitDetail } from "@places/contracts";
import { Chip, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { moneyExact, num } from "@/lib/format";

/**
 * 2.8 · the demo's «PDF & slide» tab: the slide as it comes out, the PDF and slide themselves (made by the system from
 * the sheet and the photos, nobody edits them), and Manar's «Confirm وانشره للسيلز» (Q15). Any edit sends it back (Q19).
 */
export function UnitPdfTab({ u, canConfirm }: { u: UnitDetail; canConfirm: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const confirm = () => void run(async () => {
    await api.post(`/inventory/units/${u.id}/pdf/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, "الـ PDF اترفع، والتسويق والسيلز وصلهم إشعار");
  return (
    <>
      <div className="pdf-preview">
        <div className="slide">
          <div className={`s-img u-${u.type}`}>{u.photo ? <img src={u.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" />}</div>
          <div className="s-txt">
            <span className="eyebrow">PLACES · {u.type}</span>
            <h3>{u.project}</h3>
            <p>{u.area} · الدور {u.floor || "—"} · {num(u.space)} م · {u.condition}</p>
            <b className="num">{moneyExact(u.totalPrice)}{u.type === "Rent" ? " / شهر" : ""}</b>
            <small className="mono">{u.code}</small>
          </div>
        </div>
      </div>
      <div className="row">
        <a className="btn ghost" href={`/api/v1/inventory/units/${u.id}/pdf`} target="_blank" rel="noopener noreferrer"><Icon name="file" />PDF</a>
        <a className="btn ghost" href={`/api/v1/inventory/units/${u.id}/slide`} target="_blank" rel="noopener noreferrer"><Icon name="image" />Slide</a>
      </div>
      <Note>الـ PDF والـ slide بيتعملوا أوتوماتيك لما كل الخانات المطلوبة تتملا، ومن الصور. محدش يقدر يعدّل عليهم. أي تعديل في بيانات الوحدة بيعمل الـ PDF من تاني ويستنى Confirm منار. والوحدة مابتظهرش للسيلز غير بعد الـ Confirm.</Note>
      {u.pdfStatus === "draft" && canConfirm
        ? <button className="btn" onClick={confirm}><Icon name="check" />Confirm وانشره للسيلز</button>
        : u.pdfStatus === "draft" ? <Chip tone="warn">مستني Confirm من منار</Chip> : <Chip tone="ok">منشور للسيلز</Chip>}
    </>
  );
}
