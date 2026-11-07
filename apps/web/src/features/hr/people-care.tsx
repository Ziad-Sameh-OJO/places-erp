"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeesView, HrActionsView, OneOnOnesView, PenaltiesView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { money } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
// Deduction choices: the value and its message key under hr.care.ded
const DED = [[0, "none"], [0.25, "quarter"], [0.5, "half"], [1, "day"], [2, "twoDays"], [3, "threeDays"]] as const;
const STATUS = { pending: "warn", approved: "ok", rejected: "bad" } as const;

/** M-05 · «الجزاءات و1-to-1» (7.7 · 7.8): the month's penalties, «حل الـ HR» that's open, and the 1-to-1 questions. */
export function PeopleCare() {
  const t = useTranslations("hr");
  const { can, me } = useMe();
  const [month, setMonth] = useState(today().slice(0, 7));
  const pens = useQuery({ queryKey: ["hr", "penalties", month], queryFn: () => api.get<PenaltiesView>(`/hr/penalties?month=${month}`) });
  const emps = useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => api.get<EmployeesView>("/hr/employees") });
  const hr = can("hr", "edit");
  const actions = useQuery({ queryKey: ["hr", "actions"], queryFn: () => api.get<HrActionsView>("/hr/one-on-one/actions"), enabled: hr });
  const questions = useQuery({ queryKey: ["hr", "questions"], queryFn: () => api.get<string[]>("/hr/one-on-one/questions") });
  const run = useAction();
  const refresh = useRefresh();
  const add = onFormSubmit(async (f) => run(async () => {
    await api.post("/hr/penalties", { employeeId: f.get("employeeId"), day: f.get("day"), text: f.get("text"), deductionDays: Number(f.get("deductionDays")) });
    await refresh();
  }, hr ? t("care.penaltyRecorded") : t("care.penaltySent")));
  const decide = (id: string, ok: boolean) => run(async () => { await api.post(`/hr/penalties/${id}/${ok ? "approve" : "reject"}`); await refresh(); }, ok ? t("care.status.approved") : t("common.rejected"));
  const remove = (id: string) => run(async () => { await api.del(`/hr/penalties/${id}`); await refresh(); }, t("care.deleted"));
  const p = pens.data;
  const dedLabel = (n: number) => { const k = DED.find(([v]) => v === n)?.[1]; return k ? t(`care.ded.${k}`) : t("care.days", { n }); };
  return (
    <>
      <Card title={t("care.penaltiesTitle")} icon="alert" sub={t("care.penaltiesSub")}
        extra={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("common.month")} />}>
        {!p ? <Empty text={t("common.loading")} icon="clock" /> : <>
          <div className="row"><Chip tone="ok">{t("care.approvedCount", { n: p.totals.approved })}</Chip>{p.totals.pending > 0 && <Chip tone="warn">{t("care.pendingCount", { n: p.totals.pending })}</Chip>}<Chip>{t("care.deductionsTotal", { amount: money(p.totals.deductions) })}</Chip></div>
          <Table head={[t("common.employee"), t("common.day"), t("care.penalty"), t("common.deduction"), t("care.by"), t("common.status"), ""]} empty={t("care.empty")}
            rows={p.items.map((x) => [<b key="n">{x.name}</b>, x.day, x.text, x.deductionDays ? <span key="d">{dedLabel(x.deductionDays)}<span className="sub">{money(x.deductionAmount)}</span></span> : "—", x.by,
              <Chip key="s" tone={STATUS[x.status]}>{t(`care.status.${x.status}`)}</Chip>,
              <span key="a" className="row">{x.canDecide && <><button className="btn sm" onClick={() => void decide(x.id, true)}>{t("care.approve")}</button><button className="btn ghost sm" onClick={() => void decide(x.id, false)}>{t("care.reject")}</button></>}
                {can("hr", "delete") && <button className="icon-btn sm" aria-label={t("care.deleteAria")} onClick={() => void remove(x.id)}><Icon name="x" /></button>}</span>])} />
        </>}
        {can("hr", "approve") && (
          <form className="grid" onSubmit={add}>
            <Field label={t("common.employee")} req><select name="employeeId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{emps.data?.items.filter((e) => e.userId !== me?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label={t("common.day")} req><input name="day" type="date" defaultValue={today()} max={today()} required /></Field>
            <Field label={t("care.penalty")} req wide><input name="text" required minLength={2} maxLength={300} /></Field>
            <Field label={t("common.deduction")}><select name="deductionDays" defaultValue="0">{DED.map(([v, k]) => <option key={v} value={v}>{t(`care.ded.${k}`)}</option>)}</select></Field>
            <div className="row end wide"><button className="btn ghost"><Icon name="plus" />{hr ? t("care.record") : t("care.suggest")}</button></div>
          </form>
        )}
      </Card>
      {hr && (
        <div className="cols">
          <Card title={t("care.openActions")} icon="clock" sub={t("care.openActionsSub")}>
            {!actions.data?.items.length ? <p className="hint">{t("common.none")}</p> : actions.data.items.map((a) => (
              <div key={a.id} className="line-item"><span><b>{a.name}</b> · {a.action} <Chip tone={a.late ? "bad" : "warn"}>{a.due}</Chip></span>
                <button className="btn ghost sm" onClick={() => void run(async () => { await api.post(`/hr/one-on-one/${a.id}/done`); await refresh(); }, t("care.done"))}>{t("care.done")}</button></div>
            ))}
          </Card>
          <Questions list={questions.data ?? []} />
        </div>
      )}
    </>
  );
}

/** «أسئلة الـ 1-to-1»: entered once, shown in every 1-to-1. */
function Questions({ list }: { list: string[] }) {
  const t = useTranslations("hr");
  const run = useAction();
  const refresh = useRefresh();
  const save = (questions: string[]) => run(async () => { await api.put("/hr/one-on-one/questions", { questions }); await refresh(); }, t("common.saved"));
  return (
    <Card title={t("care.questionsTitle")} icon="list" sub={t("care.questionsSub")}>
      {list.map((q, i) => <div key={i} className="line-item"><span>{i + 1}. {q}</span>{list.length > 1 && <button className="btn ghost sm" aria-label={t("care.removeQuestion")} onClick={() => void save(list.filter((_, j) => j !== i))}><Icon name="x" /></button>}</div>)}
      <form className="row" onSubmit={onFormSubmit(async (f) => { const q = String(f.get("q") ?? "").trim(); if (q.length >= 2) await save([...list, q]); })}>
        <input name="q" placeholder={t("care.newQuestion")} required minLength={2} aria-label={t("care.newQuestion")} /><button className="btn ghost"><Icon name="plus" />{t("care.add")}</button>
      </form>
    </Card>
  );
}

/** The employee file's «1-to-1» tab (demo empDrawer «one»): the last session on top, a new one with the questions, «حل الـ HR» with its date. */
export function OneOnOneTab({ employeeId }: { employeeId: string }) {
  const t = useTranslations("hr");
  const { can } = useMe();
  const q = useQuery({ queryKey: ["hr", "one", employeeId], queryFn: () => api.get<OneOnOnesView>(`/hr/employees/${employeeId}/one-on-one`) });
  const [action, setAction] = useState("");
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const d = q.data, [last, ...older] = d.items;
  const save = onFormSubmit(async (f) => run(async () => {
    const answers = Object.fromEntries(d.questions.map((x, i) => [x, String(f.get(`q${i}`) ?? "")]));
    await api.post(`/hr/employees/${employeeId}/one-on-one`, { heldOn: f.get("heldOn"), answers, ...(action ? { hrAction: action, hrActionDue: f.get("due") } : {}) });
    setAction(""); await refresh();
  }, t("one.savedOk")));
  return (
    <>
      {d.due && <Note kind="warn">{t("one.due")}</Note>}
      {last ? (
        <Card title={t("one.last")} icon="file" sub={`${last.heldOn}${last.by ? ` · ${last.by}` : ""}`}>
          {Object.entries(last.answers).map(([k, v]) => <div key={k} className="qa"><small>{k}</small><p>{v || "—"}</p></div>)}
          {last.hrAction && <Chip tone={last.hrActionDone ? "ok" : last.hrActionDue && last.hrActionDue < today() ? "bad" : "warn"}>{t("one.actionChip", { action: last.hrAction, due: last.hrActionDue ?? "" })}</Chip>}
        </Card>
      ) : <Note>{t("one.first")}</Note>}
      {can("hr", "edit") && (
        <form className="card flat grid" onSubmit={save}>
          <h3 className="mini-h wide"><Icon name="plus" /> {t("one.new")}</h3>
          <Field label={t("one.date")} req wide><input name="heldOn" type="date" defaultValue={today()} max={today()} required /></Field>
          {d.questions.map((x, i) => <Field key={x} label={x} wide><textarea name={`q${i}`} rows={2} /></Field>)}
          <Field label={t("one.action")} wide><input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t("one.actionPh")} /></Field>
          {action && <Field label={t("one.actionDue")} req wide><input name="due" type="date" min={today()} required /></Field>}
          <div className="row end wide"><button className="btn">{t("one.save")}</button></div>
        </form>
      )}
      {older.length > 0 && <Card title="History" icon="clock">{older.map((o) => (
        <details key={o.id} className="hist"><summary>{o.heldOn}{o.hrAction ? ` · ${o.hrAction}` : ""}</summary>{Object.entries(o.answers).map(([k, v]) => <div key={k} className="qa"><small>{k}</small><p>{v || "—"}</p></div>)}</details>
      ))}</Card>}
    </>
  );
}
