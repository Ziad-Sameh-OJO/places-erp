"use client";
import { useTranslations } from "next-intl";
import { activeValues, type LeadDetail } from "@places/contracts";
import { Field, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useSettings } from "./use-leads";
import { useRefreshLead } from "./use-lead";
import { serverText } from "@/lib/server-text";

const TYPES = ["Rent", "Resale", "Primary", "Income"] as const; // as the new-lead form (requirements M-01)
/** «رقم في كل سطر» (or commas), digits only, as the API normalises them. */
const phonesOf = (text: string) => text.split(/[\n,]/).map((p) => p.replace(/\D/g, "")).filter(Boolean);

/**
 * Demo «تعديل · <name>» (leads.js leadEdit): the lead's details. A mobile another lead has is refused by the API with
 * that lead's code (M-01 Q7); the change is audited old → new.
 */
export function EditLead({ l, onClose }: { l: LeadDetail; onClose: () => void }) {
  const t = useTranslations("leads.form");
  const run = useAction();
  const refresh = useRefreshLead();
  const settings = useSettings().data;
  // a value the settings no longer list (renamed, switched off) still shows, so saving doesn't change it by itself
  const withCurrent = (list: string[], v: string | null) => (v && !list.includes(v) ? [v, ...list] : list);
  const save = onFormSubmit((f) => run(async () => {
    const text = (k: string) => String(f.get(k) ?? "").trim();
    await api.put(`/leads/${l.id}`, {
      kind: text("kind") === "broker" ? "broker" : "client", name: text("name"), phones: phonesOf(text("phones")), area: text("area"), type: text("type"),
      ...(text("company") ? { company: text("company") } : {}), ...(text("space") ? { space: Number(text("space")) } : {}),
      ...(text("condition") ? { condition: text("condition") } : {}), ...(text("budget") ? { budget: text("budget") } : {}), ...(text("note") ? { note: text("note") } : {}),
    });
    await refresh(l.id);
    onClose();
  }, t("savedAudit")));
  return (
    <Modal title={t("editTitle", { name: l.name })} onClose={onClose}>
      <form key={settings ? "ready" : "loading"} className="grid" onSubmit={save}>
        <Field label={t("kind")} req><select name="kind" defaultValue={l.kind}><option value="client">{t("client")}</option><option value="broker">Broker</option></select></Field>
        <Field label={t("name")} req><input name="name" required minLength={2} maxLength={120} defaultValue={l.name} /></Field>
        <Field label={t("company")}><input name="company" maxLength={160} defaultValue={l.company ?? ""} /></Field>
        <Field label={t("phones")} req><textarea name="phones" required defaultValue={l.phones.join("\n")} /></Field>
        <Field label="Area">
          <select name="area" defaultValue={l.area}>{withCurrent(activeValues(settings?.areas ?? []), l.area).map((a) => <option key={a} value={a}>{serverText(a)}</option>)}</select>
        </Field>
        <Field label="Type"><select name="type" defaultValue={l.type}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Space"><input name="space" type="number" min="1" step="1" defaultValue={l.space ?? ""} /></Field>
        <Field label="Condition">
          <select name="condition" defaultValue={l.condition ?? ""}>
            <option value="">—</option>{withCurrent(activeValues(settings?.finishings ?? []), l.condition).map((c) => <option key={c} value={c}>{serverText(c)}</option>)}
          </select>
        </Field>
        <Field label="Budget"><input name="budget" inputMode="decimal" pattern="\d+(\.\d{1,2})?" dir="ltr" defaultValue={l.budget ?? ""} /></Field>
        <Field label="Note" wide><textarea name="note" maxLength={2000} defaultValue={l.note ?? ""} /></Field>
        <div className="row end wide"><button className="btn">{t("save")}</button></div>
      </form>
    </Modal>
  );
}
