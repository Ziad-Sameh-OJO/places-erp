"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DealDetail, DealForm as DealFormData } from "@places/contracts";
import { DEAL_TYPES } from "@places/domain";
import { Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
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
  const [withMe, setWithMe] = useState<string[]>([]); // «حد معاك في الديل Buyer؟»: picked one by one, not a ⌘-click list
  const { me } = useMe();
  // M-01 / M-02: a salesperson can still close a deal on their own lead that was pulled to the Draft (demo dealNew)
  const held = form?.leads.filter((l) => !l.draft) ?? [];
  const drafted = form?.leads.filter((l) => l.draft) ?? [];
  const mine = drafted.every((l) => !l.draft?.from);
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  // M-09 field permissions: a hidden field has no input, a read-only one is locked; the API sets both itself
  const fields = useFields("deals");
  const only = (key: string, node: ReactNode): ReactNode =>
    !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
  const leadOption = (l: DealFormData["leads"][number]) => (
    <option key={l.id} value={l.id}>{withCo(l, t("noCompany"))} · {l.code}{l.draft?.from ? t("wasWith", { name: l.draft.from }) : ""}</option>
  );
  const save = onFormSubmit((d) => run(async () => {
    const r = await api.post<DealDetail>("/deals", {
      leadId: d.get("leadId"), unitId: d.get("unitId"), space: Number(d.get("space") ?? (unit?.space || 1)), type: d.get("type") ?? unit?.type,
      commissionOwner: String(d.get("commissionOwner") || "0"), commissionClient: String(d.get("commissionClient") || "0"), withMe,
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
        {only("space", <Field label={t("space")} req><input key={unit?.id} name="space" type="number" min="1" required defaultValue={unit?.space || undefined} /></Field>)}
        {only("type", <Field label={t("type")} req>
          <select key={unit?.id} name="type" defaultValue={unit?.type}>{DEAL_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Field>)}
        {only("commissionOwner", <Field label={t("commOwner")}><input name="commissionOwner" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>)}
        {only("commissionClient", <Field label={t("commClient")}><input name="commissionClient" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue="0" /></Field>)}
        <Field label={t("withMe")} wide>
          <div className="tag-picker">
            <select value="" onChange={(e) => e.target.value && setWithMe([...withMe, e.target.value])} aria-label={t("withMe")}>
              <option value="">{t("withMePick")}</option>
              {form?.salespeople.filter((s) => s.id !== me?.employeeId && !withMe.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {withMe.length > 0 && (
              <div className="row wrap">
                {withMe.map((id) => {
                  const name = form?.salespeople.find((s) => s.id === id)?.name ?? "";
                  return <span key={id} className="chip acc tag-chip">{name}<button type="button" onClick={() => setWithMe(withMe.filter((x) => x !== id))} aria-label={t("withMeRemove", { name })}><Icon name="x" /></button></span>;
                })}
              </div>
            )}
          </div>
        </Field>
        <div className="row end wide">
          <span className="hint spacer">{t("hint")}</span>
          <button className="btn">{t("submit")}</button>
        </div>
      </form>
    </Modal>
  );
}
