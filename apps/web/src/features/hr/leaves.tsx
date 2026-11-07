"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveBalancesView, LeaveCalendarView, LeaveView, MyLeaves } from "@places/contracts";
import { Card, Chip, Empty, ExportButton, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { ExcusesCard } from "./excuses";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const TONE: Record<LeaveView["status"], "warn" | "info" | "bad" | "ok"> = { PENDING_TL: "warn", APPROVED_BY_TL: "info", REJECTED: "bad", CLOSED_BY_HR: "ok" };
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
const range = (l: LeaveView) => (l.from === l.to ? l.from : `${l.from} → ${l.to}`);

/** «إجازاتي» (7.5) on the profile: my balances, my requests, and «طلب إجازة» (sick / emergency after return, with a document). */
export function MyLeavesCard() {
  const tr = useTranslations("hr");
  const q = useQuery({ queryKey: ["hr", "leaves", "mine"], queryFn: () => api.get<MyLeaves>("/hr/leaves/mine"), retry: false });
  const [ask, setAsk] = useState(false);
  const [type, setType] = useState("");
  const [doc, setDoc] = useState<string | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (q.isError) return null; // no employee file (e.g. a system account)
  if (!q.data) return null;
  const d = q.data, after = d.types.find((t) => t.name === (type || d.types[0]?.name))?.afterReturn;
  const submit = onFormSubmit(async (f) => run(async () => {
    await api.post("/hr/leaves", { type: f.get("type"), from: f.get("from"), to: f.get("to"), ...(f.get("reason") ? { reason: f.get("reason") } : {}), ...(doc ? { documentId: doc } : {}) });
    await refresh(); setAsk(false); setDoc(null);
  }, tr("leaves.sentToTl")));
  return (
    <Card title={tr("leaves.mine")} icon="calendar" sub={tr("leaves.mineSub")} extra={<button className="btn sm" onClick={() => setAsk(true)}><Icon name="plus" />{tr("leaves.request")}</button>}>
      <div className="kpis sm">{d.balances.map((b) => <div key={b.type} className="kpi"><span>{serverText(b.type)}</span><strong>{b.left}</strong><small>{tr("leaves.balanceOf", { total: b.total, used: b.used })}</small></div>)}</div>
      <Table head={[tr("common.type"), tr("leaves.days"), tr("leaves.duration"), tr("common.status")]} empty={tr("leaves.noRequests")}
        rows={d.items.map((l) => [serverText(l.type), l.days, range(l), <span key="s"><Chip tone={TONE[l.status]}>{serverText(l.statusLabel)}</Chip>{l.rejectReason && <span className="sub">{l.rejectReason}</span>}</span>])} />
      {ask && (
        <Modal title={tr("leaves.request")} onClose={() => setAsk(false)}>
          <form className="grid" onSubmit={submit}>
            <Field label={tr("common.type")} req><select name="type" value={type || d.types[0]?.name} onChange={(e) => setType(e.target.value)}>{d.types.map((t) => <option key={t.name} value={t.name}>{serverText(t.name)}</option>)}</select></Field>
            <Field label={tr("common.from")} req><input name="from" type="date" required {...(after ? { max: today() } : { min: today() })} /></Field>
            <Field label={tr("common.to")} req><input name="to" type="date" required /></Field>
            <Field label={tr("common.reason")} wide><input name="reason" maxLength={300} /></Field>
            {after && <div className="wide"><Note>{tr("leaves.afterReturn")}</Note><FileUpload kind="pdf" label={tr("leaves.document")} onUploaded={(f) => setDoc(f.id)} />{doc && <Chip tone="ok">{tr("leaves.documentUploaded")}</Chip>}</div>}
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setAsk(false)}>{tr("common.cancel")}</button><button className="btn">{tr("leaves.send")}</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/** «الإجازات» (7.5 · 7.6, demo hr.js leaves()): the requests waiting for me, «مين إجازة النهارده» and the month's calendar. */
export function Leaves() {
  const t = useTranslations("hr");
  const list = useQuery({ queryKey: ["hr", "leaves", "list"], queryFn: () => api.get<LeaveView[]>("/hr/leaves") });
  const [month, setMonth] = useState(today().slice(0, 7));
  const cal = useQuery({ queryKey: ["hr", "leaves", "cal", month], queryFn: () => api.get<LeaveCalendarView>(`/hr/leaves/calendar?month=${month}`) });
  const [reject, setReject] = useState<LeaveView | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (!list.data) return <Empty text={t("common.loading")} icon="clock" />;
  const approve = (l: LeaveView) => run(async () => { await api.post(`/hr/leaves/${l.id}/approve`); await refresh(); }, l.canDecide === "tl" ? t("common.approvedToHr") : t("leaves.recordedOk"));
  const mine = list.data.filter((l) => l.canDecide), rest = list.data.filter((l) => !l.canDecide);
  const row = (l: LeaveView) => [<b key="n">{l.name}</b>, serverText(l.type), range(l), l.days, <span key="r">{l.reason ?? "—"}{l.hasDocument && <Chip tone="info">{t("leaves.doc")}</Chip>}</span>,
    <span key="s"><Chip tone={TONE[l.status]}>{serverText(l.statusLabel)}</Chip>{l.rejectReason && <span className="sub">{t("leaves.rejectedBecause", { reason: l.rejectReason })}</span>}</span>,
    l.canDecide ? <span key="a" className="row"><button className="btn sm" onClick={() => void approve(l)}>{l.canDecide === "tl" ? t("common.approve") : t("leaves.record")}</button>{l.canDecide === "tl" && <button className="btn ghost sm" onClick={() => setReject(l)}>{t("common.reject")}</button>}</span> : ""];
  const head = [t("common.employee"), t("common.type"), t("leaves.duration"), t("leaves.daysShort"), t("common.reason"), t("common.status"), ""];
  return (
    <>
      {mine.length > 0 && <Card title={t("leaves.awaiting")} icon="calendar" className="attn" extra={<Chip tone="warn">{mine.length}</Chip>} sub={t("leaves.awaitingSub")}>
        <Table head={head} rows={mine.map(row)} /></Card>}
      <ExcusesCard />
      <div className="cols wide">
        <Card title={t("leaves.requests")} icon="list"><Table head={head} empty={t("leaves.noRequests")} rows={rest.map(row)} /></Card>
        <Card title={t("leaves.offToday")} icon="users">
          <div className="row">{cal.data?.today.length ? cal.data.today.map((x) => <Chip key={x.employeeId} tone="warn">{t("leaves.offUntil", { name: x.name, type: serverText(x.type), to: x.to })}</Chip>) : <span className="hint">{t("leaves.nobody")}</span>}</div>
          <div className="row"><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("common.month")} /></div>
          {cal.data && <MonthGrid month={month} byDay={cal.data.byDay} />}
        </Card>
      </div>
      {reject && (
        <Modal title={t("leaves.rejectTitle")} onClose={() => setReject(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => { await api.post(`/hr/leaves/${reject.id}/reject`, { reason: f.get("reason") }); await refresh(); setReject(null); }, t("leaves.rejectedOk")))}>
            <Field label={t("leaves.rejectReason")} req wide><input name="reason" required minLength={2} /></Field>
            <div className="row end wide"><button className="btn danger">{t("leaves.rejectBtn")}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** The demo's U.calendar: a month, weeks starting Saturday, who's off each day. */
function MonthGrid({ month, byDay }: { month: string; byDay: LeaveCalendarView["byDay"] }) {
  const tr = useTranslations("hr");
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 1) % 7, t = today();
  return (
    <div className="cal">
      <div className="cal-head">{(["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const).map((x) => <span key={x}>{tr(`leaves.week.${x}`)}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <div key={`o${i}`} className="cal-cell off" />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, "0")}`, items = byDay[iso] ?? [];
          return <div key={iso} className={`cal-cell ${iso === t ? "today" : ""}`}><span className="cal-d">{i + 1}</span>
            {items.slice(0, 3).map((x, j) => <span key={j} className="cal-item warn" title={`${x.name} · ${serverText(x.type)}`}>{x.name.split(" ")[0]}</span>)}{items.length > 3 && <small>+{items.length - 3}</small>}</div>;
        })}
      </div>
    </div>
  );
}

/** 7.6 · «تقرير الأرصدة الشهري» (exportable): per person and type — the balance, this month, what's left. */
export function LeaveBalances() {
  const tr = useTranslations("hr");
  const [month, setMonth] = useState(today().slice(0, 7));
  const q = useQuery({ queryKey: ["hr", "leaves", "balances", month], queryFn: () => api.get<LeaveBalancesView>(`/hr/leaves/balances?month=${month}`) });
  const d = q.data;
  return (
    <>
      <div className="toolbar"><label className="date-f"><span>{tr("common.month")}</span><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label><span className="spacer" />
        <ExportButton module="hr" path="/hr/leaves/balances/export" query={new URLSearchParams({ month })} filename={tr("leaves.balancesFile", { month })} /></div>
      {!d ? <Empty text={tr("common.loading")} icon="clock" /> : (
        <Table head={[tr("common.employee"), tr("common.department"), ...d.types.map((t) => tr("leaves.balanceHead", { type: serverText(t) }))]} empty={tr("common.noEmployees")}
          rows={d.rows.map((r) => [<b key="n">{r.name}</b>, serverText(r.department), ...d.types.map((t) => { const x = r.byType[t]; return x ? tr("leaves.balanceCell", { month: x.month, left: x.left, total: x.total }) : "—"; })])} />
      )}
    </>
  );
}
