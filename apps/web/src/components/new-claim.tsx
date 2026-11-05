"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { ClaimsView } from "@places/contracts";
import { Field, Icon, Modal, Note, onFormSubmit, useAction } from "./ui";
import { api } from "@/lib/api";

/**
 * «اطلب مطالبة» (demo claims.js `claimNew`, 9.17): from Finance's claims tab, or from a deal's drawer with its company
 * and unit filled in. Shared because both the finance and the deals screens open it.
 */
export function NewClaim({ entities, initial, onClose }: { entities: ClaimsView["entities"]; initial?: { company: string; unit: string; unitInfo: string }; onClose: () => void }) {
  const run = useAction();
  const qc = useQueryClient();
  const save = onFormSubmit((d) => run(async () => {
    await api.post("/claims", Object.fromEntries(["company", "unit", "unitInfo", "amount", "side", "kind", "entityId", "note"].map((k) => [k, String(d.get(k) ?? "")])));
    await qc.invalidateQueries({ queryKey: ["finance"] }); onClose();
  }, "اتبعتت للمالية"));
  return (
    <Modal title="اطلب مطالبة" onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Note>المطالبة بتروح للمالية تعتمدها، وبتتعمل أوتوماتيك على القالب. المبلغ مش شرط يبقى نفس العمولة.</Note>
        <Field label="اسم الشركة (زي ما هيتكتب في المطالبة)" req wide><input name="company" required defaultValue={initial?.company} /></Field>
        <Field label="الوحدة" req><input name="unit" required defaultValue={initial?.unit} /></Field>
        <Field label="المطالبة على" req><select name="side" defaultValue="client"><option value="client">الـ Client</option><option value="owner">الـ Owner</option></select></Field>
        <Field label="بيانات الوحدة" req wide><input name="unitInfo" required defaultValue={initial?.unitInfo} placeholder="المشروع · المبنى · الدور · المساحة · التشطيب · المنطقة" /></Field>
        <Field label="المطالبة باسم" req><select name="entityId" defaultValue="places">{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="المبلغ" req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
        <Field label="نوع العمولة" req><input name="kind" required placeholder="مثلاً: عمولة تأجير" /></Field>
        <Field label="ملاحظة للمالية" wide><input name="note" placeholder="اختياري" /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="send" />ابعت للمالية</button></div>
      </form>
    </Modal>
  );
}
