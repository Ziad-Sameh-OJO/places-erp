"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { activeValues, type InsuranceRow, type InsuranceView, type Settings, type StoredFile } from "@places/contracts";
import { Chip, Empty, ExportButton, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { FileUpload } from "@/components/file-upload";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { money } from "../finance/money";

type Filter = "" | "yes" | "no";

/** M-05 · «التأمينات» (HR, 15 Nov): everyone with their insurance; HR edits (hr: edit), Finance hears of each change. */
export function Insurance() {
  const t = useTranslations("hr");
  const { can } = useMe();
  const [filter, setFilter] = useState<Filter>("");
  const [editing, setEditing] = useState<InsuranceRow | null>(null);
  const run = useAction();
  const query = new URLSearchParams(filter ? { insured: filter } : {});
  const q = useQuery({ queryKey: ["hr", "insurance", filter], queryFn: () => api.get<InsuranceView>(`/hr/insurance?${query}`) });
  const open = (userId: string, fileId: string) => run(async () => { const { url } = await api.get<{ url: string }>(`/hr/insurance/${userId}/files/${fileId}`); window.open(url, "_blank", "noopener"); });
  const d = q.data;
  return (
    <>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t("insurance.filter")}>
          <option value="">{t("insurance.all")}</option><option value="yes">{t("insurance.insured")}</option><option value="no">{t("insurance.notInsured")}</option>
        </select>
        <span className="spacer" />
        <ExportButton module="hr" path="/hr/insurance/export" query={query} filename={t("insurance.file")} />
      </div>
      {!d ? <Empty text={t("common.loading")} icon="clock" /> : (
        <>
          <div className="kpis">
            <KpiTile label={t("insurance.insured")} value={String(d.totals.insured)} sub={t("common.employeesCount", { count: d.items.length })} icon="users" />
            <KpiTile label={t("insurance.monthly")} value={money(d.totals.monthly)} sub={t("insurance.monthlySub")} icon="wallet" />
            <KpiTile label={t("insurance.companyShare")} value={money(d.totals.companyShare)} sub={t("insurance.companyShareSub")} icon="id" />
          </div>
          <Table head={[t("common.employee"), t("common.status"), t("insurance.provider"), t("insurance.since"), t("insurance.monthly"), t("insurance.companyShare"), t("insurance.files"), ""]} empty={t("common.noEmployees")}
            rows={d.items.map((r) => [
              <span key="n"><b>{r.name}</b><span className="sub">{serverText(r.department)}</span></span>,
              <Chip key="s" tone={r.insured ? "ok" : ""}>{r.insured ? t("insurance.insured") : t("insurance.notInsured")}</Chip>,
              r.provider ? serverText(r.provider) : "—", r.since ?? "—",
              r.insured ? money(r.monthly) : "—", r.companyShare && r.insured ? money(r.companyShare) : "—",
              r.files.length ? <span key="f">{r.files.map((f) => <button key={f.id} type="button" className="btn ghost sm" onClick={() => void open(r.userId, f.id)}><Icon name="file" />{f.name}</button>)}</span> : "—",
              can("hr", "edit") ? <button key="e" type="button" className="btn ghost sm" onClick={() => setEditing(r)}>{t("common.edit")}</button> : "",
            ])} />
        </>
      )}
      {editing && <InsuranceForm row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function InsuranceForm({ row, onClose }: { row: InsuranceRow; onClose: () => void }) {
  const t = useTranslations("hr");
  const run = useAction();
  const qc = useQueryClient();
  const [insured, setInsured] = useState(row.recorded ? row.insured : true);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [kept, setKept] = useState(row.files);
  const providers = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") }).data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["hr", "insurance"] });
  const remove = (id: string) => run(async () => { await api.del(`/hr/insurance/${row.userId}/files/${id}`); setKept((x) => x.filter((f) => f.id !== id)); await refresh(); }, t("insurance.fileRemoved"));
  const save = onFormSubmit((d) => run(async () => {
    const text = (k: string) => String(d.get(k) ?? "").trim();
    await api.put(`/hr/insurance/${row.userId}`, insured
      ? { insured, since: text("since") || null, provider: text("provider"), monthly: text("monthly") || "0", companyShare: text("companyShare") || null, note: text("note") || null, files: files.map((f) => f.id) }
      : { insured, note: text("note") || null, files: files.map((f) => f.id) });
    await refresh(); onClose();
  }, t("insurance.saved")));
  return (
    <Modal title={t("insurance.title", { name: row.name })} onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <div className="wide"><label className="tog"><input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} /><span>{t("insurance.isInsured")}</span></label></div>
        {insured && <>
          <Field label={t("insurance.provider")} req>
            <input name="provider" list="insurance-providers" defaultValue={row.provider || (providers ? activeValues(providers.insuranceProviders)[0] : "")} required maxLength={80} />
            <datalist id="insurance-providers">{providers && activeValues(providers.insuranceProviders).map((v) => <option key={v} value={v}>{serverText(v)}</option>)}</datalist>
          </Field>
          <Field label={t("insurance.since")} req><input name="since" type="date" defaultValue={row.since ?? ""} required /></Field>
          <Field label={t("insurance.monthlyField")} req><input name="monthly" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={row.recorded ? row.monthly : ""} required /></Field>
          <Field label={t("insurance.companyShareField")}><input name="companyShare" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={row.companyShare ?? ""} /></Field>
        </>}
        <Field label={t("insurance.note")} wide><textarea name="note" rows={2} maxLength={500} defaultValue={row.note ?? ""} /></Field>
        <Field label={t("insurance.files")} wide>
          <div className="row"><FileUpload kind="pdf" onUploaded={(f) => setFiles((x) => [...x, f])} /><FileUpload kind="image" label={t("insurance.photo")} onUploaded={(f) => setFiles((x) => [...x, f])} /></div>
          {kept.map((f) => <span key={f.id} className="chip-e"><Icon name="file" />{f.name}<button type="button" aria-label={t("insurance.removeFile", { name: f.name })} onClick={() => void remove(f.id)}><Icon name="x" /></button></span>)}
          {files.length > 0 && <p className="hint"><Icon name="file" /> {files.map((f) => f.name).join(" · ")}</p>}
        </Field>
        <Note>{t("insurance.financeNote")}</Note>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button><button className="btn"><Icon name="check" />{t("common.save")}</button></div>
      </form>
    </Modal>
  );
}
