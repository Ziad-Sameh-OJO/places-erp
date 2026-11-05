"use client";
import { useState } from "react";
import type { DealDetail } from "@places/contracts";
import { DEAL_TYPES } from "@places/domain";
import { Field, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useDealForm, useDealUnits, useRefreshDeals } from "./use-deals";

/** The company always shows next to the lead's name (demo meeting, 4 Nov). */
const withCo = (l: { name: string; company: string | null }) => `${l.name} · ${l.company ?? "من غير شركة"}`;

/** «سجّل صفقة» (demo deals.js `dealNew`): the company and source come from the lead, the location and Seller from the unit. */
export function DealForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const form = useDealForm().data;
  const units = useDealUnits().data ?? [];
  const run = useAction();
  const refresh = useRefreshDeals();
  const [unitId, setUnitId] = useState("");
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const save = onFormSubmit((d) => run(async () => {
    const r = await api.post<DealDetail>("/deals", {
      leadId: d.get("leadId"), unitId: d.get("unitId"), space: Number(d.get("space")), type: d.get("type"),
      commissionOwner: String(d.get("commissionOwner") || "0"), commissionClient: String(d.get("commissionClient") || "0"), withMe: d.getAll("withMe"),
    });
    await refresh();
    onSaved(r.id);
  }, "اتسجّلت ومستنية مراجعة الـ Office Manager"));
  return (
    <Modal title="سجّل صفقة" onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Field label="العميل (من الليدز)" req wide>
          <select name="leadId" required defaultValue="">
            <option value="" disabled>{form ? (form.leads.length ? "اختار" : "مفيش ليدز تقدر تقفل عليها") : "بيحمّل…"}</option>
            {form?.leads.map((l) => <option key={l.id} value={l.id}>{withCo(l)} · {l.code}</option>)}
          </select>
        </Field>
        <Field label="الوحدة (من الانفنتوري)" req wide>
          <select name="unitId" required value={unit?.id ?? ""} onChange={(e) => setUnitId(e.target.value)}>
            {!units.length && <option value="" disabled>مفيش وحدات متاحة</option>}
            {units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}
          </select>
          {unit?.agent && <small className="hint">الـ Seller: {unit.agent.name} (الـ Agent بتاع الوحدة · بعد موافقة منار)</small>}
        </Field>
        <Field label="المساحة اللي اتقفلت (م)" req><input key={unit?.id} name="space" type="number" min="1" required defaultValue={unit?.space} /></Field>
        <Field label="النوع" req>
          <select key={unit?.id} name="type" defaultValue={unit?.type}>{DEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </Field>
        <Field label="عمولة متوقعة من الـ Owner"><input name="commissionOwner" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>
        <Field label="عمولة متوقعة من الـ Client"><input name="commissionClient" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>
        <Field label="حد معاك في الديل Buyer؟" wide>
          <select name="withMe" multiple size={3}>{form?.salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <div className="row end wide">
          <span className="hint spacer">الشركة والـ source بيتسجّلوا من بيانات العميل. الصفقة بتوصل للـ Office Manager الأول، والتحصيل بتسجّله المالية.</span>
          <button className="btn">حفظ الصفقة</button>
        </div>
      </form>
    </Modal>
  );
}
