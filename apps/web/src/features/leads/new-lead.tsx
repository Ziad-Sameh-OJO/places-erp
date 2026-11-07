"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { activeValues, type CreatedLead, type DuplicateCheckResult } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { useLeadOptions, useSettings } from "./use-leads";

const TYPES = ["Rent", "Resale", "Primary", "Income"] as const; // requirements M-01 (the demo leaves Primary out)
/** «رقم في كل سطر» (or commas), digits only, as the API normalises them. */
const phonesOf = (text: string) => text.split(/[\n,]/).map((p) => p.replace(/\D/g, "")).filter(Boolean);
/** The API's «العميل ده موجود (L-…) · …» (sent to Operations), in whichever language the error came in. */
function sentToOperations(msg: string) {
  const [head = "", tail = ""] = serverText("العميل ده موجود (\u0000) · اتبعت للأوبريشن تقرر").split("\u0000");
  return msg.startsWith(head) && msg.endsWith(tail);
}

/** Waits for the typing to settle before asking the API about the mobiles. */
function useSettled(value: string, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Demo «ليد جديد». Routing is the API's: a salesperson's own lead stays theirs, Telesales chooses «يفضل عندي» or
 * «التوزيع», Operations may pick a salesperson by hand (uses up their turn), everyone else goes by area.
 * A mobile we already have is flagged while typing; only someone who may open that lead gets a link to it (M-01 Q7).
 */
/** `kind`: the tab the list is on — the brokers tab opens the form on «Broker» (demo). */
export function NewLead({ onClose, onOpenLead, kind = "client" }: { onClose: () => void; onOpenLead: (id: string) => void; kind?: "client" | "broker" }) {
  const t = useTranslations("leads.form");
  const { me, can } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const settings = useSettings();
  const options = useLeadOptions();
  const [phones, setPhones] = useState("");
  const [channel, setChannel] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const checked = phonesOf(useSettled(phones)).filter((p) => /^01[0-25]\d{8}$/.test(p));
  const dup = useQuery({
    queryKey: ["lead-dup", checked.join(",")], enabled: checked.length > 0,
    queryFn: () => api.get<DuplicateCheckResult>(`/leads/duplicate-check?phones=${checked.join(",")}`),
  }).data?.hit;
  const isTelesales = !!me?.roles.includes("telesales");
  const ownLead = me?.scope === "own" && !isTelesales;
  const byHand = can("leads", "approve") && !!options.data?.salespeople.length;
  const campaigns = (options.data?.campaigns ?? []).filter((c) => c.channel === channel);
  // «اكتب أو اختار من شيت الشركات» (1.20): a name that isn't in the sheet is a new company
  const typedCompany = useSettled(company.trim());
  const sheetNames = useQuery({ queryKey: ["company-names", typedCompany], enabled: !!typedCompany, queryFn: () => api.get<string[]>(`/companies/names?q=${encodeURIComponent(typedCompany)}`) }).data;
  const newCompany = !!typedCompany && !!sheetNames && !sheetNames.some((n) => n.toLowerCase() === typedCompany.toLowerCase());

  const save = async (f: FormData) => {
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      name: text("name"), kind: text("kind") === "broker" ? "broker" : "client", phones: phonesOf(text("phones")), area: text("area"), type: text("type"), channel: text("channel"),
      ...(text("company") ? { company: text("company") } : {}), ...(text("space") ? { space: Number(text("space")) } : {}),
      ...(text("condition") ? { condition: text("condition") } : {}), ...(text("budget") ? { budget: text("budget") } : {}),
      ...(text("campaignId") ? { campaignId: text("campaignId") } : {}), ...(text("assignToId") ? { assignToId: text("assignToId") } : {}),
      ...(isTelesales ? { keep: text("keep") === "keep" } : {}), ...(f.get("addco") && text("company") ? { companyCategory: text("companyCategory") } : {}), ...(text("note") ? { note: text("note") } : {}),
    };
    setBusy(true);
    try {
      const lead = await api.post<CreatedLead>("/leads", body);
      toast(lead.assignedTo === null ? t("savedNoSales")
        : lead.ownedByTelesales || ownLead ? t("savedYours") : t("savedTo", { name: lead.assignedTo.name }));
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error");
      toast(msg);
      if (sentToOperations(msg)) onClose(); // sent to Operations: nothing more to do here (demo)
    } finally {
      setBusy(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["lead-duplicates"] })]);
    }
  };

  return (
    <Modal title={t("newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("kind")} req><select name="kind" defaultValue={kind}><option value="client">{t("client")}</option><option value="broker">Broker</option></select></Field>
        <Field label={t("name")} req><input name="name" required minLength={2} maxLength={120} /></Field>
        <Field label={t("company")}>
          <input name="company" maxLength={160} placeholder={t("companyPlaceholder")} list="coList" value={company} onChange={(e) => setCompany(e.target.value)} />
          <datalist id="coList">{(sheetNames ?? []).map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        {newCompany && <NewCompanyNote name={typedCompany} telesales={isTelesales} categories={activeValues(settings.data?.companyCategories ?? [])} />}
        <Field label={t("phones")} req>
          <textarea name="phones" required placeholder="01xxxxxxxxx" value={phones} onChange={(e) => setPhones(e.target.value)} />
        </Field>
        {dup && (
          <div className="wide">
            <Note kind="warn">
              {t.rich("duplicate", { code: dup.code, b: (c) => <b className="mono">{c}</b> })}
              {dup.leadId && <> <button type="button" className="link" onClick={() => onOpenLead(dup.leadId!)}>{t("openLead")}</button></>}
            </Note>
          </div>
        )}
        <Field label="Area" req>
          <select name="area" required defaultValue=""><option value="">{t("pick")}</option>{activeValues(settings.data?.areas ?? []).map((a) => <option key={a}>{a}</option>)}</select>
        </Field>
        <Field label="Type"><select name="type">{TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t("spaceM")}><input name="space" type="number" min="1" step="1" /></Field>
        <Field label="Condition"><select name="condition">{activeValues(settings.data?.finishings ?? []).map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Budget"><input name="budget" type="number" min="0" step="1" dir="ltr" /></Field>
        <Field label="Channel" req>
          <select name="channel" required value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t("pick")}</option>{activeValues(settings.data?.channels ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Campaign name">
          <select name="campaignId">
            {channel ? <><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</> : <option value="">{t("channelFirst")}</option>}
          </select>
        </Field>
        {ownLead && <p className="hint wide">{t("ownLead")}</p>}
        {byHand && (
          <Field label="Sales">
            <select name="assignToId"><option value="">{t("autoByArea")}</option>{options.data!.salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <small className="hint">{t("byHandNote")}</small>
          </Field>
        )}
        {isTelesales && (
          <Field label={t("goesTo")}>
            <select name="keep"><option value="route">{t("route")}</option><option value="keep">{t("keep")}</option></select>
          </Field>
        )}
        <Field label="Note" wide><textarea name="note" maxLength={2000} /></Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn" disabled={busy}>{dup ? t("sendToOps") : t("saveLead")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Demo: a company that isn't in the sheet — Telesales can add it here with its category; anyone else's goes to her (M-01 2.1). */
function NewCompanyNote({ name, telesales, categories }: { name: string; telesales: boolean; categories: string[] }) {
  const t = useTranslations("leads.form");
  if (!telesales) return <div className="wide"><Note>{t("newCompanyNote", { name })}</Note></div>;
  return (
    <div className="wide">
      <Note kind="warn">
        <span className="spacer">{t("notInSheet", { name })}</span>
        <label className="row"><input type="checkbox" name="addco" /> {t("addToSheet")}</label>
        <select name="companyCategory" aria-label={t("category")} style={{ maxWidth: 160 }}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      </Note>
    </div>
  );
}
