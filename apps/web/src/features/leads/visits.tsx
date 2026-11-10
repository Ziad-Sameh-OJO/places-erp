"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadDetail, VisitRow, VisitUnit } from "@places/contracts";
import { Chip, Empty, Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/format";
import { useRefreshLead } from "./use-lead";

type Kind = VisitRow["kind"];

/**
 * Demo «الزيارات» (1.9, M-01 3.3): every Visit / Meeting with its Alarm when the time came, Done / معملتهاش / تعديل,
 * and the form under it. Booking moves the lead to «Follow up to …», Done to Visit / Meeting (the API decides, forward
 * only). «اتأجلت» (1.24): a reason, then whom the lead rules name (the TL) approves or rejects.
 */
export function Visits({ l, kind }: { l: LeadDetail; kind: Kind }) {
  const t = useTranslations("leads.visits");
  const { can } = useMe();
  const run = useAction();
  const refresh = useRefreshLead();
  const [editing, setEditing] = useState<VisitRow | null>(null);
  const [postponing, setPostponing] = useState<VisitRow | null>(null);
  const edit = can("leads", "edit");
  const mark = (v: VisitRow, outcome: "done" | "not_done") => void run(async () => {
    try { await api.post(`/leads/${l.id}/visits/${v.id}/outcome`, { outcome }); } finally { await refresh(l.id); }
  }, outcome === "done" ? t("doneToast", { kind: v.kind }) : t("notDoneToast"));
  const decide = (v: VisitRow, approve: boolean) => void run(async () => {
    try { await api.post(`/leads/${l.id}/visits/${v.id}/postpone/decision`, { approve }); } finally { await refresh(l.id); }
  }, approve ? t("approvedToast") : t("rejectedToast"));
  const p = (v: VisitRow) => v.postpone?.status;
  return (
    <>
      {l.visits.length ? l.visits.map((v) => {
        const d = new Date(v.at);
        return (
          <div key={v.id} className={`visit ${v.outcome === "done" ? "done" : v.due ? "due" : ""}`}>
            <div className="v-date"><b>{d.toLocaleDateString("en-US", { timeZone: "Africa/Cairo", day: "numeric" })}</b><small>{d.toLocaleDateString(dateLocale(), { timeZone: "Africa/Cairo", month: "short" })}</small></div>
            <div className="v-main">
              <b>{v.kind} · {d.toLocaleTimeString(dateLocale(), { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" })} · {v.units.map((u) => u.code).join(t("sep")) || t("unitsTbd")}</b>
              {v.extra && <small>{t("extra", { extra: v.extra })}</small>}
              {v.postpone && <small>{t("postponeReason", { reason: v.postpone.reason })}</small>}
              {v.due && <small className="bad-t"><Icon name="bell" />{t("alarm", { kind: v.kind })}</small>}
            </div>
            {v.outcome === "done" ? <Chip tone="ok">{t("done")}</Chip>
              : v.outcome === "not_done" ? <Chip tone="bad">{t("notDone")}</Chip>
              : p(v) === "approved" ? <Chip tone="info">{t("postponedApproved")}</Chip>
              : p(v) === "pending" ? <>
                <Chip tone="warn">{t("postponedPending")}</Chip>
                {v.postpone?.canDecide && <><button className="btn sm" onClick={() => decide(v, true)}>{t("approve")}</button><button className="btn ghost sm" onClick={() => decide(v, false)}>{t("reject")}</button></>}
              </>
              : edit && <>
                <button className="btn sm" onClick={() => mark(v, "done")}>Done</button>
                <button className="btn ghost sm" onClick={() => mark(v, "not_done")}>{t("didntDo")}</button>
                {!p(v) && <button className="btn ghost sm" onClick={() => setPostponing(v)}>{t("postponed")}</button>}
                <button className="btn ghost sm" onClick={() => setEditing(v)}>{t("edit")}</button>
              </>}
          </div>
        );
      }) : <Empty text={t("empty")} icon="pin" />}
      {edit && <VisitForm key={editing?.id ?? `new-${kind}`} l={l} kind={kind} editing={editing} onDone={() => setEditing(null)} />}
      {postponing && <Modal title={t("postponeTitle", { kind: postponing.kind, name: l.name })} onClose={() => setPostponing(null)}>
        <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
          try { await api.post(`/leads/${l.id}/visits/${postponing.id}/postpone`, { reason: f.get("reason") }); setPostponing(null); } finally { await refresh(l.id); }
        }, t("sentToTl")))}>
          <Field label={t("reason")} req wide><textarea name="reason" required minLength={3} maxLength={300} placeholder={t("reasonPlaceholder")} /></Field>
          <p className="hint wide">{t("goesToTl")}</p>
          <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setPostponing(null)}>{t("cancel")}</button><button className="btn">{t("sendRequest")}</button></div>
        </form>
      </Modal>}
    </>
  );
}

/** «Visit / Meeting جديدة» or «تعديل الميعاد»: the unit search filters the list; picked units always stay in it. */
function VisitForm({ l, kind, editing, onDone }: { l: LeadDetail; kind: Kind; editing: VisitRow | null; onDone: () => void }) {
  const run = useAction();
  const refresh = useRefreshLead();
  const t = useTranslations("leads.visits");
  const [k, setK] = useState<Kind>(editing?.kind ?? kind);
  const [at, setAt] = useState(editing ? localInput(editing.at) : "");
  const [picked, setPicked] = useState<VisitUnit[]>(editing?.units ?? []);
  const [extra, setExtra] = useState(editing?.extra ?? "");
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  useEffect(() => { const id = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const found = useQuery({ queryKey: ["visit-units", search], queryFn: () => api.get<VisitUnit[]>(`/leads/visit-units${search ? `?q=${encodeURIComponent(search)}` : ""}`) });
  const options = [...picked, ...(found.data ?? []).filter((u) => !picked.some((p) => p.id === u.id))];
  const save = () => void run(async () => {
    const body = { kind: k, at: fromCairoInput(at), unitIds: picked.map((u) => u.id), ...(extra.trim() ? { extra: extra.trim() } : {}) };
    try {
      if (editing) await api.put(`/leads/${l.id}/visits/${editing.id}`, body);
      else await api.post(`/leads/${l.id}/visits`, body);
      onDone(); setAt(""); setPicked([]); setExtra(""); setQ("");
    } finally { await refresh(l.id); }
  }, t("saved", { kind: k }));
  return (
    <form className="card flat" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="card-head"><h3><span className="ico"><Icon name="pin" /></span><span>{editing ? t("editTime") : t("newTitle")}<small>{t("newSub")}</small></span></h3></div>
      <div className="grid">
        <Field label={t("kind")} req>
          <select value={k} onChange={(e) => setK(e.target.value as Kind)}>{(["Visit", "Meeting"] as const).map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Field>
        <Field label={t("time")} req><input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label={t("unitsFromInventory")} wide>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} /></div>
          <select multiple size={6} aria-label={t("units")} value={picked.map((u) => u.id)}
            onChange={(e) => { const on = new Set([...e.target.selectedOptions].map((o) => o.value)); setPicked(options.filter((u) => on.has(u.id))); }}>
            {options.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project} · {t("sqm", { n: u.space })}</option>)}
          </select>
        </Field>
        <Field label={t("extraLabel")} wide><input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t("extraPlaceholder")} maxLength={300} /></Field>
      </div>
      <div className="row end">
        {editing && <button type="button" className="btn ghost" onClick={onDone}>{t("cancel")}</button>}
        <button className="btn"><Icon name="pin" />{t("saveTime")}</button>
      </div>
    </form>
  );
}

/** The datetime-local value (Cairo wall clock) back as an instant: the browser's own zone must not move the visit. */
function fromCairoInput(local: string): string {
  const guess = new Date(`${local}:00Z`);
  const cairo = (d: Date) => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .format(d).replace(/(\d+)-(\d+)-(\d+), (\d+):(\d+):(\d+)/, "$1-$2-$3T$4:$5:$6Z")).getTime();
  // the offset at that moment (two passes for the daylight-saving switch days)
  let t = guess.getTime() - (cairo(guess) - guess.getTime());
  t = guess.getTime() - (cairo(new Date(t)) - new Date(t).getTime());
  return new Date(t).toISOString();
}

/** An ISO time as the datetime-local input wants it, in Cairo time («2026-11-05T11:30»). */
function localInput(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
