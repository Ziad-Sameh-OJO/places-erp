"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DealDetail, DealForm as DealFormData } from "@places/contracts";
import { DEAL_TYPES } from "@places/domain";
import { Field, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useDealForm, useDealUnits, useRefreshDeals } from "./use-deals";

/** The company always shows next to the lead's name (demo meeting, 4 Nov). */
const withCo = (l: { name: string; company: string | null }, noCompany: string) => `${l.name} · ${l.company ?? noCompany}`;

/**
 * «سجّل صفقة» (demo deals.js `dealNew`): the company and source come from the lead, the location and Seller from the unit.
 * `leadId`: opened from a lead's drawer («سجّل الصفقة», or the stage set to Done Deal) — that lead is picked.
 */
export function DealForm({ onClose, onSaved, leadId }: { onClose: () => void; onSaved: (id: string) => void; leadId?: string }) {
  const t = useTranslations("deals.form");
  const form = useDealForm().data;
  const picked = form?.leads.find((l) => l.id === leadId);
  const units = useDealUnits().data ?? [];
  const run = useAction();
  const refresh = useRefreshDeals();
  const [unitId, setUnitId] = useState("");
  // M-01 / M-02: a salesperson can still close a deal on their own lead that was pulled to the Draft (demo dealNew)
  const held = form?.leads.filter((l) => !l.draft) ?? [];
  const drafted = form?.leads.filter((l) => l.draft) ?? [];
  const mine = drafted.every((l) => !l.draft?.from);
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const leadOption = (l: DealFormData["leads"][number]) => (
    <option key={l.id} value={l.id}>{withCo(l, t("noCompany"))} · {l.code}{l.draft?.from ? t("wasWith", { name: l.draft.from }) : ""}</option>
  );
  const save = onFormSubmit((d) => run(async () => {
    const r = await api.post<DealDetail>("/deals", {
      leadId: d.get("leadId"), unitId: d.get("unitId"), space: Number(d.get("space")), type: d.get("type"),
      commissionOwner: String(d.get("commissionOwner") || "0"), commissionClient: String(d.get("commissionClient") || "0"), withMe: d.getAll("withMe"),
    });
    await refresh();
    onSaved(r.id);
  }, t("saved")));
  return (
    <Modal title={picked ? t("titleFor", { lead: withCo(picked, t("noCompany")) }) : t("title")} onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Field label={t("client")} req wide>
          <select key={form ? "ready" : "loading"} name="leadId" required defaultValue={picked?.id ?? ""}>
            <option value="" disabled>{form ? (form.leads.length ? t("pick") : t("noLeads")) : t("loading")}</option>
            {drafted.length ? (
              <>
                <optgroup label={mine ? t("yourLeads") : t("leads")}>{held.map(leadOption)}</optgroup>
                <optgroup label={t("fromDraft")}>{drafted.map(leadOption)}</optgroup>
              </>
            ) : held.map(leadOption)}
          </select>
        </Field>
        <Field label={t("unit")} req wide>
          <select name="unitId" required value={unit?.id ?? ""} onChange={(e) => setUnitId(e.target.value)}>
            {!units.length && <option value="" disabled>{t("noUnits")}</option>}
            {units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}
          </select>
          {unit?.agent && <small className="hint">{t("seller", { name: unit.agent.name })}</small>}
        </Field>
        <Field label={t("space")} req><input key={unit?.id} name="space" type="number" min="1" required defaultValue={unit?.space} /></Field>
        <Field label={t("type")} req>
          <select key={unit?.id} name="type" defaultValue={unit?.type}>{DEAL_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Field>
        <Field label={t("commOwner")}><input name="commissionOwner" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>
        <Field label={t("commClient")}><input name="commissionClient" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>
        <Field label={t("withMe")} wide>
          <select name="withMe" multiple size={3}>{form?.salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <div className="row end wide">
          <span className="hint spacer">{t("hint")}</span>
          <button className="btn">{t("submit")}</button>
        </div>
      </form>
    </Modal>
  );
}
