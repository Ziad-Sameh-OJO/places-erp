"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LeadDetail, VisitRow, VisitUnit } from "@places/contracts";
import { Chip, Empty, Field, Icon, useAction } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { useRefreshLead } from "./use-lead";

type Kind = VisitRow["kind"];

/**
 * Demo «الزيارات» (1.9, M-01 3.3): every Visit / Meeting with its Alarm when the time came, Done / معملتهاش / تعديل,
 * and the form under it. Booking moves the lead to «Follow up to …», Done to Visit / Meeting (the API decides, forward
 * only). Postponing is 1.24.
 */
export function Visits({ l, kind }: { l: LeadDetail; kind: Kind }) {
  const { can } = useMe();
  const run = useAction();
  const refresh = useRefreshLead();
  const [editing, setEditing] = useState<VisitRow | null>(null);
  const edit = can("leads", "edit");
  const mark = (v: VisitRow, outcome: "done" | "not_done") => void run(async () => {
    try { await api.post(`/leads/${l.id}/visits/${v.id}/outcome`, { outcome }); } finally { await refresh(l.id); }
  }, outcome === "done" ? `الـ ${v.kind} خلصت · اتحسبت في الـ activity` : "اتسجّلت إنها محصلتش · ظاهرة للـ HR في الحضور");
  return (
    <>
      {l.visits.length ? l.visits.map((v) => {
        const d = new Date(v.at);
        return (
          <div key={v.id} className={`visit ${v.outcome === "done" ? "done" : v.due ? "due" : ""}`}>
            <div className="v-date"><b>{d.toLocaleDateString("en-US", { timeZone: "Africa/Cairo", day: "numeric" })}</b><small>{d.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", month: "short" })}</small></div>
            <div className="v-main">
              <b>{v.kind} · {d.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" })} · {v.units.map((u) => u.code).join("، ") || "وحدات هتتحدد"}</b>
              {v.extra && <small>مساحات مش في الشيت: {v.extra}</small>}
              {v.due && <small className="bad-t"><Icon name="bell" />Alarm: ميعاد الـ {v.kind} جه · دوس Done</small>}
            </div>
            {v.outcome === "done" ? <Chip tone="ok">Done · اتحسبت في الـ activity</Chip>
              : v.outcome === "not_done" ? <Chip tone="bad">معملهاش · ظاهرة للـ HR</Chip>
              : edit && <>
                <button className="btn sm" onClick={() => mark(v, "done")}>Done</button>
                <button className="btn ghost sm" onClick={() => mark(v, "not_done")}>معملتهاش</button>
                <button className="btn ghost sm" onClick={() => setEditing(v)}>تعديل</button>
              </>}
          </div>
        );
      }) : <Empty text="مفيش زيارات لسه" icon="pin" />}
      {edit && <VisitForm key={editing?.id ?? `new-${kind}`} l={l} kind={kind} editing={editing} onDone={() => setEditing(null)} />}
    </>
  );
}

/** «Visit / Meeting جديدة» or «تعديل الميعاد»: the unit search filters the list; picked units always stay in it. */
function VisitForm({ l, kind, editing, onDone }: { l: LeadDetail; kind: Kind; editing: VisitRow | null; onDone: () => void }) {
  const run = useAction();
  const refresh = useRefreshLead();
  const [k, setK] = useState<Kind>(editing?.kind ?? kind);
  const [at, setAt] = useState(editing ? localInput(editing.at) : "");
  const [picked, setPicked] = useState<VisitUnit[]>(editing?.units ?? []);
  const [extra, setExtra] = useState(editing?.extra ?? "");
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const found = useQuery({ queryKey: ["visit-units", search], queryFn: () => api.get<VisitUnit[]>(`/leads/visit-units${search ? `?q=${encodeURIComponent(search)}` : ""}`) });
  const options = [...picked, ...(found.data ?? []).filter((u) => !picked.some((p) => p.id === u.id))];
  const save = () => void run(async () => {
    const body = { kind: k, at: new Date(at).toISOString(), unitIds: picked.map((u) => u.id), ...(extra.trim() ? { extra: extra.trim() } : {}) };
    try {
      if (editing) await api.put(`/leads/${l.id}/visits/${editing.id}`, body);
      else await api.post(`/leads/${l.id}/visits`, body);
      onDone(); setAt(""); setPicked([]); setExtra(""); setQ("");
    } finally { await refresh(l.id); }
  }, `الـ ${k} اتحفظ`);
  return (
    <form className="card flat" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="card-head"><h3><span className="ico"><Icon name="pin" /></span><span>{editing ? "تعديل الميعاد" : "Visit / Meeting جديدة"}<small>بتنقل الليد لمرحلة Visit أو Meeting</small></span></h3></div>
      <div className="grid">
        <Field label="النوع" req>
          <select value={k} onChange={(e) => setK(e.target.value as Kind)}>{(["Visit", "Meeting"] as const).map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Field>
        <Field label="الميعاد" req><input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="الوحدات (من الانفنتوري)" wide>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالكود، المشروع أو المساحة" aria-label="دوّر على وحدة" /></div>
          <select multiple size={6} aria-label="الوحدات" value={picked.map((u) => u.id)}
            onChange={(e) => { const on = new Set([...e.target.selectedOptions].map((o) => o.value)); setPicked(options.filter((u) => on.has(u.id))); }}>
            {options.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project} · {u.space} م</option>)}
          </select>
        </Field>
        <Field label="مساحات مش موجودة في الشيت" wide><input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="مثلاً: دور 4 في مبنى B6" maxLength={300} /></Field>
      </div>
      <div className="row end">
        {editing && <button type="button" className="btn ghost" onClick={onDone}>إلغاء</button>}
        <button className="btn"><Icon name="pin" />حفظ الميعاد</button>
      </div>
    </form>
  );
}

/** An ISO time as the datetime-local input wants it, in Cairo time («2026-11-05T11:30»). */
function localInput(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
