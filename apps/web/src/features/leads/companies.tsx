"use client";
import { type FormEvent, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CompanyUpdate, type AddedCompany, type CompanyRow, type CompanySheet, type PendingCompany } from "@places/contracts";
import { CONTRACT_ENDING_DAYS, OUTBOUND_WEEKLY_TARGET, keepsCompaniesSheet } from "@places/domain";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Card, ExportButton, Field, Icon, Modal, Table, onFormSubmit, useAction, useToast } from "@/components/ui";
import { OldDataImport } from "../imports/old-data-import";

const KEY = ["companies"];
const PAGE = 100;

export const usePendingCompanies = (enabled: boolean) =>
  useQuery({ queryKey: [...KEY, "pending"], queryFn: () => api.get<PendingCompany[]>("/companies/pending"), enabled });

/** The demo's columns (the client's archive), in its order. */
const COLS: [keyof CompanyRow, string][] = [
  ["feedback", "feedback"], ["name", "company name"], ["number", "number"], ["contactName", "name"], ["contactTitle", "title"], ["email", "email"],
  ["currentLocation", "current location"], ["currentSpace", "current space"], ["contractStart", "start contract date"], ["contractEnd", "end contract date"],
  ["averageRent", "average current price rent"], ["annualEscalation", "annual escalation"], ["date", "date"],
];
const cell = (c: CompanyRow, k: keyof CompanyRow) => {
  const v = c[k];
  if (v === null || v === "") return "—";
  if (k === "contractStart" || k === "contractEnd" || k === "date") return day(String(v));
  if (k === "annualEscalation") return `${Number(v)}%`;
  return String(v);
};

/** Demo «شيت الشركات» (1.20): new companies from leads to add, the Outbound row, the category filter, the sheet. */
export function CompaniesSheet() {
  const t = useTranslations("leads.companies");
  const { me } = useMe();
  const keeper = keepsCompaniesSheet(me?.roles ?? []); // comfort only: the API decides
  const [category, setCategory] = useState("");
  const [soon, setSoon] = useState(false); // 1.21 «عقدهم بيخلص خلال 90 يوم»
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const filters = new URLSearchParams({ ...(category ? { category } : {}), ...(soon ? { endingWithin: String(CONTRACT_ENDING_DAYS) } : {}) });
  const sheet = useQuery({
    queryKey: [...KEY, filters.toString()], placeholderData: keepPreviousData,
    queryFn: () => api.get<CompanySheet>(`/companies?pageSize=${PAGE}&${filters}`),
  });
  const s = sheet.data;
  return (
    <>
      {keeper && <PendingList categories={s?.categories.map((c) => c.name) ?? []} />}
      {keeper && s && <AddRow categories={s.categories.map((c) => c.name)} outbound={s.outboundThisWeek} />}
      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("category")}>
          <option value="">{t("allCategories", { count: s?.categories.length ?? 0 })}</option>
          {(s?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name} · {c.count}</option>)}
        </select>
        <label className="tog"><input type="checkbox" checked={soon} onChange={(e) => setSoon(e.target.checked)} /><span>{t("endingSoon", { days: CONTRACT_ENDING_DAYS })}</span></label>
        <span className="hint spacer">{t("count", { count: s?.total ?? 0 })}</span>
        {keeper && <OldDataImport kind="companies" label={t("import")} />}
        <ExportButton module="leads" path="/companies/export" query={filters} filename={soon ? t("fileEnding") : t("file")} label={t("export")} />
      </div>
      <Table className="wide" head={[...COLS.map(([, h]) => h), ...(category ? [] : ["category"])]}
        rows={(s?.items ?? []).map((c) => [...COLS.map(([k]) => k === "contractEnd" && soon ? <span key={k} className="bad-t">{cell(c, k)}</span> : cell(c, k)), ...(category ? [] : [c.category])])} empty={t("empty")}
        {...(keeper ? { onRow: (i: number) => setEditing(s?.items[i] ?? null) } : {})} />
      {keeper && (s?.items.length ?? 0) > 0 && <p className="hint">{t("editHint")}</p>}
      {editing && s && <EditCompany company={editing} categories={s.categories.map((c) => c.name)} onClose={() => setEditing(null)} />}
      {s && s.total > s.items.length && <p className="hint">{t("shownFirst", { shown: s.items.length, total: s.total })}</p>}
    </>
  );
}

/** «شركات جديدة محتاجة تتضاف»: each one with its category and «أضف للشيت». */
function PendingList({ categories }: { categories: string[] }) {
  const t = useTranslations("leads.companies");
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const pending = usePendingCompanies(true).data ?? [];
  if (!pending.length) return null;
  const add = (p: PendingCompany) => onFormSubmit((f) => run(async () => {
    const c = await api.post<AddedCompany>(`/companies/pending/${p.id}`, { category: String(f.get("category") ?? "") });
    toast(t("added", { name: c.name, category: c.category }));
    await qc.invalidateQueries({ queryKey: KEY });
  }));
  return (
    <Card className="flat attn" title={t("pendingTitle")} icon="alert">
      {pending.map((p) => (
        <form className="line-item" key={p.id} onSubmit={add(p)}>
          <span><span><b>{p.name}</b> · {t("pendingLine", { code: p.lead.code, by: p.by })}</span></span>
          <select name="category" aria-label={t("categoryOf", { name: p.name })} style={{ maxWidth: 170 }}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn sm">{t("addToSheet")}</button>
        </form>
      ))}
    </Card>
  );
}

/** Demo's Outbound row: name · category · number, and this week's count of 15. */
function AddRow({ categories, outbound }: { categories: string[]; outbound: number }) {
  const t = useTranslations("leads.companies");
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    return run(async () => {
      const c = await api.post<AddedCompany>("/companies", { name: f.get("name"), category: f.get("category"), number: f.get("number") });
      toast(c.leadCode ? t("addedInLead", { code: c.leadCode }) : t("addedOutbound"));
      form.reset(); // only once it was added: a refused one keeps what was typed
      await qc.invalidateQueries({ queryKey: KEY });
    });
  };
  return (
    <form className="row" onSubmit={submit}>
      <input name="name" required maxLength={160} placeholder={t("newCompany")} aria-label={t("companyName")} />
      <select name="category" aria-label={t("category")} style={{ maxWidth: 160 }}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      <input name="number" required maxLength={40} placeholder={t("number")} style={{ maxWidth: 130 }} aria-label={t("number")} />
      <button className="btn sm"><Icon name="plus" />{t("add")}</button>
      <span className="hint">{t.rich("outbound", { count: outbound, target: OUTBOUND_WEEKLY_TARGET, b: (c) => <b>{c}</b> })}</span>
    </form>
  );
}

/** «عدّل»: every column of the sheet, in its order; an empty box clears it. The sheet's keepers only (M-01 2.1). */
function EditCompany({ company: c, categories, onClose }: { company: CompanyRow; categories: string[]; onClose: () => void }) {
  const t = useTranslations("leads.companies");
  const run = useAction();
  const qc = useQueryClient();
  const save = (f: FormData) => run(async () => {
    const text = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
    const number = (k: string) => { const v = text(k); return v === null ? null : Number(v); };
    const body = CompanyUpdate.parse({
      name: text("name") ?? "", category: text("category") ?? "", number: text("number") ?? "", contactName: text("contactName"), contactTitle: text("contactTitle"),
      email: text("email"), currentLocation: text("currentLocation"), currentSpace: number("currentSpace"), contractStart: text("contractStart"), contractEnd: text("contractEnd"),
      averageRent: text("averageRent"), annualEscalation: number("annualEscalation"), feedback: text("feedback"),
    });
    await api.patch(`/companies/${c.id}`, body);
    await qc.invalidateQueries({ queryKey: KEY });
    onClose();
  }, t("saved", { name: String(f.get("name") ?? "") }));
  const v = (x: string | number | null) => (x === null ? "" : String(x));
  return (
    <Modal title={t("editTitle", { name: c.name })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="feedback" wide><textarea name="feedback" defaultValue={v(c.feedback)} maxLength={2000} /></Field>
        <Field label="company name" req><input name="name" required maxLength={160} defaultValue={c.name} /></Field>
        <Field label="number" req><input name="number" required maxLength={40} defaultValue={v(c.number)} /></Field>
        <Field label="name"><input name="contactName" maxLength={120} defaultValue={v(c.contactName)} /></Field>
        <Field label="title"><input name="contactTitle" maxLength={120} defaultValue={v(c.contactTitle)} /></Field>
        <Field label="email"><input name="email" type="email" maxLength={200} defaultValue={v(c.email)} /></Field>
        <Field label="current location"><input name="currentLocation" maxLength={200} defaultValue={v(c.currentLocation)} /></Field>
        <Field label="current space"><input name="currentSpace" type="number" min={1} step={1} defaultValue={v(c.currentSpace)} /></Field>
        <Field label="start contract date"><input name="contractStart" type="date" defaultValue={v(c.contractStart)} /></Field>
        <Field label="end contract date"><input name="contractEnd" type="date" defaultValue={v(c.contractEnd)} /></Field>
        <Field label="average current price rent"><input name="averageRent" inputMode="decimal" defaultValue={c.averageRent ? String(Number(c.averageRent)) : ""} /></Field>
        <Field label="annual escalation (%)"><input name="annualEscalation" type="number" min={0} max={100} step="0.01" defaultValue={c.annualEscalation ? String(Number(c.annualEscalation)) : ""} /></Field>
        <Field label={t("category")} req>
          <select name="category" required defaultValue={c.category}>{(categories.includes(c.category) ? categories : [c.category, ...categories]).map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn"><Icon name="check" />{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
