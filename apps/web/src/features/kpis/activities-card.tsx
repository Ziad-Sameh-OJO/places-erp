"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityView, MyActivities } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { useRefreshKpis } from "./use-kpis";

/** 11.13 «نشاطاتي · Farming و Approach» on the home page (demo kpis.js `actCard`). */
export function ActivitiesCard() {
  const q = useQuery({ queryKey: ["kpis", "activities"], queryFn: () => api.get<MyActivities>("/kpis/activities") });
  const [adding, setAdding] = useState(false);
  const [answering, setAnswering] = useState<ActivityView | null>(null);
  if (!q.data?.show) return null;
  return (
    <Card title="نشاطاتي · Farming و Approach" icon="pin" sub="بتتسجل هنا وبتتحسب في الـ KPIs بتاعتك">
      {q.data.items.map((a) => <Line key={a.id} a={a} onAnswer={() => setAnswering(a)} />)}
      {!q.data.items.length && <p className="hint">مفيش نشاطات لسه</p>}
      <div className="row end"><button className="btn ghost sm" onClick={() => setAdding(true)}><Icon name="plus" />نشاط جديد</button></div>
      {adding && <NewActivity onClose={() => setAdding(false)} />}
      {answering && <Result a={answering} onClose={() => setAnswering(null)} />}
    </Card>
  );
}

const outcome = (a: ActivityView) => a.kind === "Farming" ? `${a.got ? "جاب حاجة · " : "مجابش حاجة · "}${a.note ?? ""}` : `شركات: ${a.companies.join("، ")}`;

function Line({ a, onAnswer }: { a: ActivityView; onAnswer: () => void }) {
  const due = new Date(a.at) <= new Date();
  return (
    <div className="line-item">
      <span><Chip tone={a.kind === "Farming" ? "info" : ""} plain>{a.kind}</Chip><b>{a.place}</b><small className="hint">{dayTime(a.at)}</small></span>
      {a.status === "done" ? <><small>{outcome(a)}</small><Chip tone="ok" plain>اتعمل</Chip></>
        : a.status === "notDone" ? <Chip tone="bad" plain>ماتعملش</Chip>
        : due ? <button className="btn sm" onClick={onAnswer}>عملتها؟</button> : <Chip plain>جاي</Chip>}
    </div>
  );
}

function NewActivity({ onClose }: { onClose: () => void }) {
  const run = useAction(), refresh = useRefreshKpis();
  const save = (f: FormData) => run(async () => {
    const at = String(f.get("at") ?? "");
    await api.post("/kpis/activities", { kind: f.get("kind"), place: f.get("place"), at: at && new Date(at).toISOString() });
    await refresh(); onClose();
  }, "اتسجّل · بعد الميعاد هيتسألك عملته ولا لأ");
  return (
    <Modal title="نشاط جديد" onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="النوع" req><select name="kind"><option value="Farming">Farming</option><option value="Approach">Approach</option></select></Field>
        <Field label="المكان" req><input name="place" required placeholder="مثلاً: التجمع الخامس · شارع التسعين" /></Field>
        <Field label="الميعاد" req><input name="at" type="datetime-local" required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="plus" />سجّل</button></div>
      </form>
    </Modal>
  );
}

function Result({ a, onClose }: { a: ActivityView; onClose: () => void }) {
  const run = useAction(), refresh = useRefreshKpis();
  const send = (body: object, ok: string) => run(async () => { await api.post(`/kpis/activities/${a.id}/result`, body); await refresh(); onClose(); }, ok);
  const done = (f: FormData) => send({
    done: true, got: f.get("got") === "on", note: String(f.get("note") ?? ""),
    companies: String(f.get("companies") ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean),
  }, `اتسجّل · نزلت ${a.kind} مرة كمان`);
  return (
    <Modal title={`${a.kind} · ${a.place}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(done)}>
        {a.kind === "Farming" ? <>
          <label className="tog wide"><input type="checkbox" name="got" /><span>جبت حاجة جديدة (مباني أو انفنتوري)</span></label>
          <Field label="جبت إيه؟" wide><textarea name="note" placeholder="مثلاً: مبنى جديد 4 أدوار إداري · رقم المالك…" /></Field>
        </> : <Field label="الشركات اللي عملت عليها Approach (شركة في كل سطر)" req wide><textarea name="companies" required /></Field>}
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={() => void send({ done: false }, "اتسجّل إنه ماتعملش")}>ماعملتهاش</button>
          <button className="btn"><Icon name="check" />عملتها</button>
        </div>
      </form>
    </Modal>
  );
}
