"use client";
import { type FormEvent, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddedCompany, CompanyRow, CompanySheet, PendingCompany } from "@places/contracts";
import { CONTRACT_ENDING_DAYS, OUTBOUND_WEEKLY_TARGET, keepsCompaniesSheet } from "@places/domain";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Card, ExportButton, Icon, Modal, Table, onFormSubmit, useAction, useToast } from "@/components/ui";

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
export function CompaniesSheet({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const keeper = keepsCompaniesSheet(me?.roles ?? []); // comfort only: the API decides
  const [category, setCategory] = useState("");
  const [soon, setSoon] = useState(false); // 1.21 «عقدهم بيخلص خلال 90 يوم»
  const filters = new URLSearchParams({ ...(category ? { category } : {}), ...(soon ? { endingWithin: String(CONTRACT_ENDING_DAYS) } : {}) });
  const sheet = useQuery({
    queryKey: [...KEY, filters.toString()], placeholderData: keepPreviousData,
    queryFn: () => api.get<CompanySheet>(`/companies?pageSize=${PAGE}&${filters}`),
  });
  const s = sheet.data;
  return (
    <Modal title="شيت الشركات" onClose={onClose}>
      {keeper && <PendingList categories={s?.categories.map((c) => c.name) ?? []} />}
      {keeper && s && <AddRow categories={s.categories.map((c) => c.name)} outbound={s.outboundThisWeek} />}
      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="الكاتيجوري">
          <option value="">كل الكاتيجوريز ({s?.categories.length ?? 0})</option>
          {(s?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name} · {c.count}</option>)}
        </select>
        <label className="tog"><input type="checkbox" checked={soon} onChange={(e) => setSoon(e.target.checked)} /><span>عقدهم بيخلص خلال {CONTRACT_ENDING_DAYS} يوم</span></label>
        <span className="hint spacer">{s?.total ?? 0} شركة</span>
        <ExportButton module="leads" path="/companies/export" query={filters} filename={soon ? "شركات عقدها قرّب يخلص.xlsx" : "شيت الشركات.xlsx"} />
      </div>
      <Table className="wide" head={[...COLS.map(([, h]) => h), ...(category ? [] : ["category"])]}
        rows={(s?.items ?? []).map((c) => [...COLS.map(([k]) => k === "contractEnd" && soon ? <span key={k} className="bad-t">{cell(c, k)}</span> : cell(c, k)), ...(category ? [] : [c.category])])} empty="مفيش شركات" />
      {s && s.total > s.items.length && <p className="hint">ظاهر أول {s.items.length} من {s.total} · اختار كاتيجوري.</p>}
    </Modal>
  );
}

/** «شركات جديدة محتاجة تتضاف»: each one with its category and «أضف للشيت». */
function PendingList({ categories }: { categories: string[] }) {
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const pending = usePendingCompanies(true).data ?? [];
  if (!pending.length) return null;
  const add = (p: PendingCompany) => onFormSubmit((f) => run(async () => {
    const c = await api.post<AddedCompany>(`/companies/pending/${p.id}`, { category: String(f.get("category") ?? "") });
    toast(`${c.name} اتضافت تحت ${c.category}`);
    await qc.invalidateQueries({ queryKey: KEY });
  }));
  return (
    <Card className="flat attn" title="شركات جديدة محتاجة تتضاف" icon="alert">
      {pending.map((p) => (
        <form className="line-item" key={p.id} onSubmit={add(p)}>
          <span><span><b>{p.name}</b> · ليد {p.lead.code} · أضافها {p.by}</span></span>
          <select name="category" aria-label={`كاتيجوري ${p.name}`} style={{ maxWidth: 170 }}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn sm">أضف للشيت</button>
        </form>
      ))}
    </Card>
  );
}

/** Demo's Outbound row: name · category · number, and this week's count of 15. */
function AddRow({ categories, outbound }: { categories: string[]; outbound: number }) {
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    return run(async () => {
      const c = await api.post<AddedCompany>("/companies", { name: f.get("name"), category: f.get("category"), number: f.get("number") });
      toast(c.leadCode ? `اتضافت · الرقم ده موجود في ليد ${c.leadCode}` : "اتضافت · بتتحسب في الـ Outbound بتاعك");
      form.reset(); // only once it was added: a refused one keeps what was typed
      await qc.invalidateQueries({ queryKey: KEY });
    });
  };
  return (
    <form className="row" onSubmit={submit}>
      <input name="name" required maxLength={160} placeholder="شركة جديدة (Outbound)" aria-label="اسم الشركة" />
      <select name="category" aria-label="الكاتيجوري" style={{ maxWidth: 160 }}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      <input name="number" required maxLength={40} placeholder="الرقم" style={{ maxWidth: 130 }} aria-label="الرقم" />
      <button className="btn sm"><Icon name="plus" />أضف</button>
      <span className="hint">Outbound الأسبوع ده: <b>{outbound}</b> من {OUTBOUND_WEEKLY_TARGET}</span>
    </form>
  );
}
