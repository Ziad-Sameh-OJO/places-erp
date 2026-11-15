"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FILE_KINDS, UploadRequest, type EmployeeFileDocs, type OneOnOneCoverage, type OneOnOneReportRow, type StoredFile, type UploadTicket } from "@places/contracts";
import { Card, Chip, Empty, ExportButton, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { put } from "@/components/file-upload";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { day } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const MIMES = [...FILE_KINDS.pdf.mimes, ...FILE_KINDS.image.mimes] as readonly string[];
const KIND_ICON = { upload: "file", one_on_one: "users", penalty: "alert" } as const;

/** HR and the admins (scope «all» with hr: view) see the employee file; the API checks the same. */
export const useSeesEmployeeFile = () => { const { me, can } = useMe(); return me?.scope === "all" && can("hr"); };

export const openEmployeeDoc = async (id: string) => {
  const { url } = await api.get<{ url: string }>(`/hr/employee-docs/${id}/url`);
  window.open(url, "_blank", "noopener");
};

/** «ورق ناقص» per employee for the list (HR and the admins only). */
export function useMissingDocs() {
  const sees = useSeesEmployeeFile();
  return useQuery({ queryKey: ["hr", "docs-missing"], queryFn: () => api.get<Record<string, number>>("/hr/employee-docs/missing"), enabled: sees }).data;
}

/** The drawer's «الملف» (HR, 15 Nov): the required papers ✓ / missing, an upload, and the timeline, newest first. */
export function EmployeeDocsTab({ employeeId }: { employeeId: string }) {
  const t = useTranslations("hr.employeeFile");
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["hr", "docs", employeeId], queryFn: () => api.get<EmployeeFileDocs>(`/hr/employees/${employeeId}/documents`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["hr"] });
  if (!q.data) return <Empty text={t("loading")} icon="clock" />;
  const d = q.data;
  const upload = onFormSubmit(async (f) => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    await run(async () => {
      const req = { name: file.name, mime: file.type, size: file.size };
      const check = UploadRequest.safeParse(req);
      if (!check.success) throw new Error(check.error.issues[0]!.message);
      if (!MIMES.includes(file.type)) throw new Error(t("needType"));
      const ticket = await api.post<UploadTicket>("/files/uploads", req);
      await put(ticket, file, () => undefined);
      const stored = await api.post<StoredFile>(`/files/${ticket.id}/complete`);
      await api.post(`/hr/employees/${employeeId}/documents`, { fileId: stored.id, title: String(f.get("title") ?? ""), ...(f.get("docType") ? { docType: String(f.get("docType")) } : {}) });
      await refresh();
    }, t("uploaded"));
    setBusy(false);
  });
  const remove = (id: string) => run(async () => { await api.del(`/hr/employee-docs/${id}`); await refresh(); }, t("deleted"));
  const deletable = new Set(d.documents.filter((x) => x.kind === "upload").map((x) => x.id));
  return (
    <>
      <Card title={t("required")} icon="list" sub={d.missing ? t("missingCount", { n: d.missing }) : t("allThere")}>
        {d.required.map((r) => (
          <div key={r.type} className="line-item"><span>{r.type}</span>
            {r.docId ? <button className="btn ghost sm" onClick={() => void run(() => openEmployeeDoc(r.docId!))}><Icon name="check" />{t("open")}</button> : <Chip tone="warn">{t("missing")}</Chip>}</div>
        ))}
      </Card>
      {can("hr", "edit") && (
        <form className="card flat grid" onSubmit={upload}>
          <h3 className="mini-h wide"><Icon name="upload" /> {t("upload")}</h3>
          <Field label={t("title")} req><input name="title" required minLength={2} maxLength={150} /></Field>
          <Field label={t("type")}><select name="docType" defaultValue=""><option value="">{t("other")}</option>{d.required.map((r) => <option key={r.type} value={r.type}>{r.type}</option>)}</select></Field>
          <Field label={t("file")} req wide><input name="file" type="file" required accept={MIMES.join(",")} /></Field>
          <span className="hint wide">{t("hint")}</span>
          <div className="row end wide"><button className="btn" disabled={busy}>{busy ? t("uploading") : t("save")}</button></div>
        </form>
      )}
      <Card title={t("timeline")} icon="clock">
        {!d.timeline.length ? <p className="hint">{t("empty")}</p> : (
          <div className="timeline">{d.timeline.map((x, i) => (
            <div key={i} className="row">
              <span style={{ flex: 1, minWidth: 0 }}><Icon name={KIND_ICON[x.kind as keyof typeof KIND_ICON] ?? "file"} /> <b>{x.title}</b><small>{day(x.day)}{x.sub ? ` · ${x.sub}` : ""}</small></span>
              {x.docId && <button className="btn ghost sm" onClick={() => void run(() => openEmployeeDoc(x.docId!))}><Icon name="download" />{t("download")}</button>}
              {x.docId && deletable.has(x.docId) && can("hr", "delete") && <button className="icon-btn sm" aria-label={t("delete")} onClick={() => void remove(x.docId!)}><Icon name="x" /></button>}
            </div>
          ))}</div>
        )}
      </Card>
    </>
  );
}

/** «الأوراق المطلوبة»: the list HR keeps (setting `employeeDocTypes`). */
function DocTypes() {
  const t = useTranslations("hr.employeeFile");
  const qc = useQueryClient();
  const run = useAction();
  const list = useQuery({ queryKey: ["hr", "doc-types"], queryFn: () => api.get<string[]>("/hr/employee-docs/types") }).data ?? [];
  const save = (types: string[]) => run(async () => { await api.put("/hr/employee-docs/types", { types }); await qc.invalidateQueries({ queryKey: ["hr"] }); }, t("saved"));
  return (
    <Card title={t("typesTitle")} icon="list" sub={t("typesSub")}>
      {list.map((x, i) => <div key={x} className="line-item"><span>{i + 1}. {x}</span><button className="btn ghost sm" aria-label={t("delete")} onClick={() => void save(list.filter((y) => y !== x))}><Icon name="x" /></button></div>)}
      <form className="row" onSubmit={onFormSubmit(async (f) => { const x = String(f.get("x") ?? "").trim(); if (x.length >= 2) await save([...list, x]); })}>
        <input name="x" placeholder={t("newType")} required minLength={2} aria-label={t("newType")} /><button className="btn ghost"><Icon name="plus" />{t("add")}</button>
      </form>
    </Card>
  );
}

/** HR's 1-to-1 tab: this month's coverage (every salesperson, one a month), the from–to report with its Excel, the papers list. */
export function OneOnOnes() {
  const t = useTranslations("hr.employeeFile");
  const { can } = useMe();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [range, setRange] = useState({ from: `${today().slice(0, 7)}-01`, to: today() });
  const cov = useQuery({ queryKey: ["hr", "coverage", month], queryFn: () => api.get<OneOnOneCoverage>(`/hr/one-on-one/coverage?month=${month}`) }).data;
  const qs = new URLSearchParams(range);
  const rep = useQuery({ queryKey: ["hr", "one-report", qs.toString()], queryFn: () => api.get<OneOnOneReportRow[]>(`/hr/one-on-one/report?${qs}`), enabled: range.from <= range.to }).data;
  const done = cov?.items.filter((i) => i.heldOn).length ?? 0;
  return (
    <>
      <Card title={t("coverageTitle")} icon="users" sub={t("coverageSub")} extra={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("month")} />}>
        {!cov ? <Empty text={t("loading")} icon="clock" /> : <>
          <div className="row"><Chip tone="ok">{t("doneCount", { n: done })}</Chip>{cov.items.length - done > 0 && <Chip tone="warn">{t("leftCount", { n: cov.items.length - done })}</Chip>}</div>
          <Table head={[t("employee"), t("status")]} empty={t("noSales")}
            rows={cov.items.map((i) => [<b key="n">{i.name}</b>, i.heldOn ? <Chip key="s" tone="ok">✓ {day(i.heldOn)}</Chip> : <Chip key="s" tone="warn">{t("notYet")}</Chip>])} />
        </>}
      </Card>
      <Card title={t("reportTitle")} icon="chart" sub={t("reportSub")}
        extra={<ExportButton module="hr" path="/hr/one-on-one/report/export" query={qs} filename={t("reportFile", { from: range.from, to: range.to })} />}>
        <div className="toolbar row">
          <Field label={t("from")}><input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></Field>
          <Field label={t("to")}><input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        {!rep ? <Empty text={t("loading")} icon="clock" /> : (
          <Table head={[t("employee"), t("date"), t("by"), t("summary"), t("hrAction"), t("actionDone")]} empty={t("noneInRange")}
            rows={rep.map((r) => [<b key="n">{r.name}</b>, day(r.heldOn), r.by || "—", <span key="s" className="sub">{r.summary || "—"}</span>,
              r.hrAction ? `${r.hrAction}${r.hrActionDue ? ` · ${day(r.hrActionDue)}` : ""}` : "—",
              r.hrAction ? <Chip key="d" tone={r.hrActionDone ? "ok" : "warn"}>{r.hrActionDone ? t("yes") : t("notYet")}</Chip> : "—"])} />
        )}
      </Card>
      {can("hr", "edit") ? <DocTypes /> : <Note>{t("typesReadOnly")}</Note>}
    </>
  );
}
