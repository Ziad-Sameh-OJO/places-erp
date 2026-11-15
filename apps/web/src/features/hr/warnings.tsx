"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { EmployeesView, ImprovementView, WarningSettingsView, WarningView } from "@places/contracts";
import { WARNING_TRIGGERS, type WarningRule } from "@places/domain";
import { Card, Chip, Empty, Field, Icon, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
const WARN_TONE = { due: "warn", issued: "bad", dismissed: "" } as const;
const PLAN_TONE = { requested: "warn", submitted: "warn", follow_up: "", closed: "ok" } as const;

/** M-05 · «الإنذارات» (HR 15 Nov): the flagged and issued warnings, a warning by hand, and HR's rules and template. */
export function Warnings() {
  const t = useTranslations("hr");
  const [employeeId, setEmployeeId] = useState("");
  const list = useQuery({ queryKey: ["hr", "warnings", employeeId], queryFn: () => api.get<WarningView[]>(`/hr/warnings${employeeId ? `?employeeId=${employeeId}` : ""}`) });
  const emps = useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => api.get<EmployeesView>("/hr/employees") });
  const run = useAction();
  const refresh = useRefresh();
  const issue = (id: string) => onFormSubmit(async (f) => run(async () => { await api.post(`/hr/warnings/${id}/issue`, { type: f.get("type") }); await refresh(); }, t("warnings.issued")));
  const dismiss = (id: string) => run(async () => { await api.post(`/hr/warnings/${id}/dismiss`); await refresh(); }, t("warnings.dismissed"));
  const pdf = (id: string) => run(async () => { window.open((await api.get<{ url: string }>(`/hr/warnings/${id}/pdf`)).url, "_blank", "noopener"); });
  const add = onFormSubmit(async (f) => run(async () => {
    await api.post("/hr/warnings", { employeeId: f.get("employeeId"), reason: f.get("reason"), type: f.get("type") });
    await refresh();
  }, t("warnings.issued")));
  const people = emps.data?.items ?? [];
  return (
    <>
      <Card title={t("warnings.title")} icon="alert" sub={t("warnings.sub")}
        extra={<select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label={t("common.employee")}><option value="">{t("warnings.allEmployees")}</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}>
        {!list.data ? <Empty text={t("common.loading")} icon="clock" /> : (
          <Table head={[t("common.employee"), t("common.month"), t("warnings.reason"), t("warnings.type"), t("common.status"), ""]} empty={t("warnings.empty")}
            rows={list.data.map((w) => [<b key="n">{w.name}</b>, w.month, w.reason,
              w.status === "due" ? <form key="t" id={`w-${w.id}`} onSubmit={issue(w.id)}><input name="type" defaultValue={w.type} required minLength={2} maxLength={120} aria-label={t("warnings.type")} /></form> : w.type,
              <Chip key="s" tone={WARN_TONE[w.status]}>{t(`warnings.status.${w.status}`)}{w.by ? ` · ${w.by}` : ""}</Chip>,
              <span key="a" className="row">
                {w.status === "due" && <><button className="btn sm" form={`w-${w.id}`}>{t("warnings.issue")}</button><button className="btn ghost sm" onClick={() => void dismiss(w.id)}>{t("warnings.dismiss")}</button></>}
                {w.hasPdf && <button className="btn ghost sm" onClick={() => void pdf(w.id)}><Icon name="file" />{t("warnings.pdf")}</button>}
              </span>])} />
        )}
      </Card>
      <div className="cols">
        <Card title={t("warnings.newTitle")} icon="plus" sub={t("warnings.newSub")}>
          <form className="grid" onSubmit={add}>
            <Field label={t("common.employee")} req wide><select name="employeeId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label={t("warnings.reason")} req wide><input name="reason" required minLength={2} maxLength={300} /></Field>
            <Field label={t("warnings.type")} req wide><input name="type" required minLength={2} maxLength={120} /></Field>
            <div className="row end wide"><button className="btn"><Icon name="file" />{t("warnings.issue")}</button></div>
          </form>
        </Card>
        <Rules />
      </div>
    </>
  );
}

/** «قواعد الإنذارات» and the template: one save for both (setting `warningRules` · `warningTemplate`). */
function Rules() {
  const t = useTranslations("hr");
  const q = useQuery({ queryKey: ["hr", "warning-settings"], queryFn: () => api.get<WarningSettingsView>("/hr/warnings/settings") });
  const [rules, setRules] = useState<WarningRule[] | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return <Card title={t("warnings.rulesTitle")} icon="bolt"><Empty text={t("common.loading")} icon="clock" /></Card>;
  const list = rules ?? q.data.rules;
  const set = (i: number, patch: Partial<WarningRule>) => setRules(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = onFormSubmit(async (f) => run(async () => { await api.put("/hr/warnings/settings", { rules: list, template: f.get("template") }); setRules(null); await refresh(); }, t("common.saved")));
  return (
    <Card title={t("warnings.rulesTitle")} icon="bolt" sub={t("warnings.rulesSub")}>
      <form className="grid" onSubmit={save}>
        {list.map((r, i) => (
          <div key={r.id} className="wide" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) 64px minmax(0, 2fr) auto", gap: 8, alignItems: "center" }}>
            <select value={r.trigger} onChange={(e) => set(i, { trigger: e.target.value as WarningRule["trigger"] })} aria-label={t("warnings.rulesTitle")}>{WARNING_TRIGGERS.map((k) => <option key={k} value={k}>{t(`warnings.trigger.${k}`)}</option>)}</select>
            <input type="number" min={0} max={31} value={r.min} onChange={(e) => set(i, { min: Number(e.target.value) })} aria-label={t("warnings.min")} />
            <input value={r.type} onChange={(e) => set(i, { type: e.target.value })} required minLength={2} maxLength={120} aria-label={t("warnings.type")} />
            <button type="button" className="icon-btn sm" aria-label={t("warnings.removeRule")} onClick={() => setRules(list.filter((_, j) => j !== i))}><Icon name="x" /></button>
          </div>
        ))}
        <div className="row wide"><button type="button" className="btn ghost sm" onClick={() => setRules([...list, { id: `r${Date.now()}`, trigger: "excuses", min: 3, type: "" }])}><Icon name="plus" />{t("warnings.addRule")}</button></div>
        <Field label={t("warnings.template")} req wide><textarea name="template" rows={4} defaultValue={q.data.template} required minLength={10} maxLength={3000} /></Field>
        <p className="hint wide">{t("warnings.templateHint", { type: "{type}" })}</p>
        <div className="row end wide"><button className="btn">{t("common.save")}</button></div>
      </form>
    </Card>
  );
}

/** M-05 · «خطة التحسين»: HR sees who's under the line and asks the TL; the TL writes his; HR follows and closes. */
export function Improvement() {
  const t = useTranslations("hr");
  const { can } = useMe();
  const hr = can("hr", "edit");
  const q = useQuery({ queryKey: ["hr", "improvement"], queryFn: () => api.get<ImprovementView>("/hr/improvement") });
  const [open, setOpen] = useState<string | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const v = q.data;
  const ask = (employeeId: string) => run(async () => { await api.post("/hr/improvement", { employeeId }); await refresh(); }, t("improvement.requested"));
  const threshold = onFormSubmit(async (f) => run(async () => { await api.put("/hr/improvement/threshold", { threshold: Number(f.get("threshold")) }); await refresh(); }, t("common.saved")));
  const submit = (id: string) => onFormSubmit(async (f) => run(async () => {
    await api.post(`/hr/improvement/${id}/submit`, { goals: f.get("goals"), actions: f.get("actions"), dueDate: f.get("dueDate") });
    setOpen(null); await refresh();
  }, t("improvement.sent")));
  const step = (id: string, s: "follow" | "close", note?: string) => run(async () => { await api.post(`/hr/improvement/${id}/step`, { step: s, ...(note ? { note } : {}) }); await refresh(); }, s === "close" ? t("improvement.closed") : t("common.saved"));
  return (
    <>
      {hr && (
        <Card title={t("improvement.title")} icon="chart" sub={t("improvement.sub", { threshold: v.threshold })}
          extra={<form className="row" onSubmit={threshold}><input name="threshold" type="number" min={1} max={100} defaultValue={v.threshold} aria-label={t("improvement.threshold")} style={{ width: 72 }} /><button className="btn ghost sm">{t("common.save")}</button></form>}>
          <Table head={[t("common.employee"), t("improvement.score"), t("improvement.tl"), ""]} empty={t("improvement.none")}
            rows={v.candidates.map((c) => [<b key="n">{c.name}</b>, <Chip key="s" tone="bad">{c.score}%</Chip>, c.tl ?? t("improvement.noTl"),
              c.status ? <Chip key="st" tone={PLAN_TONE[c.status]}>{t(`improvement.status.${c.status}`)}</Chip> : <button key="b" className="btn sm" disabled={!c.tl} onClick={() => void ask(c.employeeId)}>{t("improvement.request")}</button>])} />
        </Card>
      )}
      <Card title={t("improvement.plansTitle")} icon="list" sub={t("improvement.plansSub")}>
        {!v.plans.length ? <p className="hint">{t("improvement.plansEmpty")}</p> : v.plans.map((p) => (
          <div key={p.id} className="card flat">
            <div className="line-item">
              <span><b>{p.name}</b> · {p.month} · <Chip tone="bad">{p.score}%</Chip> · {p.tl} <Chip tone={PLAN_TONE[p.status]}>{t(`improvement.status.${p.status}`)}</Chip>{p.dueDate && <Chip tone={p.dueDate <= today() && p.status !== "closed" ? "bad" : ""}>{t("improvement.due")}: {p.dueDate}</Chip>}</span>
              <span className="row">
                {p.canSubmit && <button className="btn sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{t("improvement.write")}</button>}
                {p.canFollow && p.status === "submitted" && <button className="btn ghost sm" onClick={() => void step(p.id, "follow")}>{t("improvement.follow")}</button>}
              </span>
            </div>
            {p.goals && <div className="qa"><small>{t("improvement.goals")}</small><p>{p.goals}</p></div>}
            {p.actions && <div className="qa"><small>{t("improvement.actions")}</small><p>{p.actions}</p></div>}
            {p.note && <div className="qa"><small>{t("improvement.note")}</small><p>{p.note}</p></div>}
            {open === p.id && (
              <form className="grid" onSubmit={submit(p.id)}>
                <Field label={t("improvement.goals")} req wide><textarea name="goals" rows={3} defaultValue={p.goals ?? ""} required minLength={2} maxLength={2000} /></Field>
                <Field label={t("improvement.actions")} req wide><textarea name="actions" rows={3} defaultValue={p.actions ?? ""} required minLength={2} maxLength={2000} /></Field>
                <Field label={t("improvement.due")} req><input name="dueDate" type="date" min={today()} defaultValue={p.dueDate ?? ""} required /></Field>
                <div className="row end wide"><button className="btn">{t("improvement.send")}</button></div>
              </form>
            )}
            {p.canFollow && (
              <form className="row" onSubmit={onFormSubmit((f) => step(p.id, "close", String(f.get("note") ?? "")))}>
                <input name="note" required minLength={2} maxLength={1000} placeholder={t("improvement.note")} aria-label={t("improvement.note")} /><button className="btn ghost sm">{t("improvement.close")}</button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
