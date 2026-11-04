"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeesView, HrActionsView, OneOnOnesView, PenaltiesView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
const DED: [number, string][] = [[0, "من غير خصم"], [0.25, "ربع يوم"], [0.5, "نص يوم"], [1, "يوم"], [2, "يومين"], [3, "3 أيام"]];
const STATUS = { pending: ["warn", "مستني الـ HR"], approved: ["ok", "اتعتمد"], rejected: ["bad", "اترفض"] } as const;

/** M-05 · «الجزاءات و1-to-1» (7.7 · 7.8): the month's penalties, «حل الـ HR» that's open, and the 1-to-1 questions. */
export function PeopleCare() {
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
  }, hr ? "الجزاء اتسجّل · مش هيدخل الموظف المثالي الشهر ده" : "الجزاء اتبعت للـ HR"));
  const decide = (id: string, ok: boolean) => run(async () => { await api.post(`/hr/penalties/${id}/${ok ? "approve" : "reject"}`); await refresh(); }, ok ? "اتعتمد" : "اترفض");
  const remove = (id: string) => run(async () => { await api.del(`/hr/penalties/${id}`); await refresh(); }, "اتمسح");
  const p = pens.data;
  return (
    <>
      <Card title="الجزاءات الإدارية" icon="alert" sub="الجزاء بيروح الخصومات بعد موافقة الـ HR، وبيمنع الموظف إنه يبقى الموظف المثالي الشهر ده"
        extra={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" />}>
        {!p ? <Empty text="بيحمّل…" icon="clock" /> : <>
          <div className="row"><Chip tone="ok">اتعتمد {p.totals.approved}</Chip>{p.totals.pending > 0 && <Chip tone="warn">مستني {p.totals.pending}</Chip>}<Chip>خصومات {money(p.totals.deductions)}</Chip></div>
          <Table head={["الموظف", "اليوم", "الجزاء", "الخصم", "سجّله", "الحالة", ""]} empty="مفيش جزاءات الشهر ده"
            rows={p.items.map((x) => [<b key="n">{x.name}</b>, x.day, x.text, x.deductionDays ? <span key="d">{DED.find(([v]) => v === x.deductionDays)?.[1] ?? `${x.deductionDays} يوم`}<span className="sub">{money(x.deductionAmount)}</span></span> : "—", x.by,
              <Chip key="s" tone={STATUS[x.status][0]}>{STATUS[x.status][1]}</Chip>,
              <span key="a" className="row">{x.canDecide && <><button className="btn sm" onClick={() => void decide(x.id, true)}>اعتمد</button><button className="btn ghost sm" onClick={() => void decide(x.id, false)}>ارفض</button></>}
                {can("hr", "delete") && <button className="icon-btn sm" aria-label="امسح الجزاء" onClick={() => void remove(x.id)}><Icon name="x" /></button>}</span>])} />
        </>}
        {can("hr", "approve") && (
          <form className="grid" onSubmit={add}>
            <Field label="الموظف" req><select name="employeeId" required defaultValue=""><option value="" disabled>اختار</option>{emps.data?.items.filter((e) => e.userId !== me?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="اليوم" req><input name="day" type="date" defaultValue={today()} max={today()} required /></Field>
            <Field label="الجزاء" req wide><input name="text" required minLength={2} maxLength={300} /></Field>
            <Field label="الخصم"><select name="deductionDays" defaultValue="0">{DED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <div className="row end wide"><button className="btn ghost"><Icon name="plus" />{hr ? "سجّل جزاء" : "اقترح جزاء للـ HR"}</button></div>
          </form>
        )}
      </Card>
      {hr && (
        <div className="cols">
          <Card title="حل الـ HR المفتوح" icon="clock" sub="من جلسات الـ 1-to-1 · بييجي عليه Alarm يوم ميعاده">
            {!actions.data?.items.length ? <p className="hint">مفيش</p> : actions.data.items.map((a) => (
              <div key={a.id} className="line-item"><span><b>{a.name}</b> · {a.action} <Chip tone={a.late ? "bad" : "warn"}>{a.due}</Chip></span>
                <button className="btn ghost sm" onClick={() => void run(async () => { await api.post(`/hr/one-on-one/${a.id}/done`); await refresh(); }, "خلص")}>خلص</button></div>
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
  const run = useAction();
  const refresh = useRefresh();
  const save = (questions: string[]) => run(async () => { await api.put("/hr/one-on-one/questions", { questions }); await refresh(); }, "اتحفظ");
  return (
    <Card title="أسئلة الـ 1-to-1" icon="list" sub="بتتدخّل مرة واحدة وتظهر في كل 1-to-1">
      {list.map((q, i) => <div key={i} className="line-item"><span>{i + 1}. {q}</span>{list.length > 1 && <button className="btn ghost sm" aria-label="شيل السؤال" onClick={() => void save(list.filter((_, j) => j !== i))}><Icon name="x" /></button>}</div>)}
      <form className="row" onSubmit={onFormSubmit(async (f) => { const q = String(f.get("q") ?? "").trim(); if (q.length >= 2) await save([...list, q]); })}>
        <input name="q" placeholder="سؤال جديد" required minLength={2} aria-label="سؤال جديد" /><button className="btn ghost"><Icon name="plus" />إضافة</button>
      </form>
    </Card>
  );
}

/** The employee file's «1-to-1» tab (demo empDrawer «one»): the last session on top, a new one with the questions, «حل الـ HR» with its date. */
export function OneOnOneTab({ employeeId }: { employeeId: string }) {
  const { can } = useMe();
  const q = useQuery({ queryKey: ["hr", "one", employeeId], queryFn: () => api.get<OneOnOnesView>(`/hr/employees/${employeeId}/one-on-one`) });
  const [action, setAction] = useState("");
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return <Empty text="بيحمّل…" icon="clock" />;
  const d = q.data, [last, ...older] = d.items;
  const save = onFormSubmit(async (f) => run(async () => {
    const answers = Object.fromEntries(d.questions.map((x, i) => [x, String(f.get(`q${i}`) ?? "")]));
    await api.post(`/hr/employees/${employeeId}/one-on-one`, { heldOn: f.get("heldOn"), answers, ...(action ? { hrAction: action, hrActionDue: f.get("due") } : {}) });
    setAction(""); await refresh();
  }, "الـ 1-to-1 اتحفظ في الفايل"));
  return (
    <>
      {d.due && <Note kind="warn">الـ 1-to-1 بتاع الشهر ده لسه ماتعملش.</Note>}
      {last ? (
        <Card title="تقرير الـ 1-to-1 اللي فات" icon="file" sub={`${last.heldOn}${last.by ? ` · ${last.by}` : ""}`}>
          {Object.entries(last.answers).map(([k, v]) => <div key={k} className="qa"><small>{k}</small><p>{v || "—"}</p></div>)}
          {last.hrAction && <Chip tone={last.hrActionDone ? "ok" : last.hrActionDue && last.hrActionDue < today() ? "bad" : "warn"}>حل الـ HR: {last.hrAction} · {last.hrActionDue}</Chip>}
        </Card>
      ) : <Note>أول 1-to-1 مع الموظف ده.</Note>}
      {can("hr", "edit") && (
        <form className="card flat grid" onSubmit={save}>
          <h3 className="mini-h wide"><Icon name="plus" /> 1-to-1 جديد · مرة كل شهر</h3>
          <Field label="التاريخ" req wide><input name="heldOn" type="date" defaultValue={today()} max={today()} required /></Field>
          {d.questions.map((x, i) => <Field key={x} label={x} wide><textarea name={`q${i}`} rows={2} /></Field>)}
          <Field label="حل الـ HR" wide><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="لو فيه حاجة محتاجة تتعمل" /></Field>
          {action && <Field label="ميعاد تنفيذ حل الـ HR (هيجيلك Alarm)" req wide><input name="due" type="date" min={today()} required /></Field>}
          <div className="row end wide"><button className="btn">حفظ في فايل الموظف</button></div>
        </form>
      )}
      {older.length > 0 && <Card title="History" icon="clock">{older.map((o) => (
        <details key={o.id} className="hist"><summary>{o.heldOn}{o.hrAction ? ` · ${o.hrAction}` : ""}</summary>{Object.entries(o.answers).map(([k, v]) => <div key={k} className="qa"><small>{k}</small><p>{v || "—"}</p></div>)}</details>
      ))}</Card>}
    </>
  );
}
