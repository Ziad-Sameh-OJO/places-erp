"use client";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ReportInput, type ReportsPage as ReportsData, type ScheduledReportView, type TargetRow, type TargetsView, type TeamRow, type TransactionRow } from "@places/contracts";
import { useFields } from "@/lib/me";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Tabs, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { day, dayTime, money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { Bar } from "@/features/kpis/kpis-page";

type Tab = "targets" | "tl" | "sched";
type T = ReturnType<typeof useTranslations<"reports">>;
const FREQS: ReportInput["freq"][] = ["daily", "weekly", "monthly", "quarterly"];
/** The formats as the API names them; the first («inside the system») is shown through `reports.fmtInSystem`. */
const FMT = ReportInput.innerType().shape.fmt.removeDefault().options;
const pctTone = (p: number, dayPct: number) => (p < dayPct * 0.6 ? "bad" : p < dayPct ? "warn" : "");
const bold = (ch: ReactNode) => <b>{ch}</b>;
/** Sunday first, as the API counts a weekly report's day (0–6). */
const weekdays = (t: T) => [t("wd.sun"), t("wd.mon"), t("wd.tue"), t("wd.wed"), t("wd.thu"), t("wd.fri"), t("wd.sat")];
const fmtLabel = (t: T, f: ReportInput["fmt"]) => (f === FMT[0] ? t("fmtInSystem") : f);

/** M-12 · التقارير والتارجت (demo clients.js V.reports): التارجت والـ Transactions · الـ Team Leaders · التقارير ومواعيدها. */
export function ReportsPage() {
  const tr = useTranslations("reports");
  const [tab, setTab] = useState<Tab>("targets");
  return (
    <>
      <div className="row"><Tabs<Tab> items={[["targets", tr("tabs.targets")], ["tl", tr("tabs.tl")], ["sched", tr("tabs.sched")]]} value={tab} onChange={setTab} /></div>
      {tab === "sched" ? <Schedules /> : <Targets tl={tab === "tl"} />}
    </>
  );
}

function Targets({ tl }: { tl: boolean }) {
  const tr = useTranslations("reports");
  const [month, setMonth] = useState("");
  const q = useQuery({ queryKey: ["reports", "targets", month], queryFn: () => api.get<TargetsView>(`/reports/targets${month ? `?month=${month}` : ""}`) });
  const [edit, setEdit] = useState<TargetRow | null>(null);
  const f = useFields("reports");
  if (!q.data) return <Empty text={tr("loading")} />;
  const v = q.data;
  // M-09 field permissions: a hidden field's column is left out (the API blanks its value anyway)
  const cols: [string, (r: TargetRow) => ReactNode, string?][] = [
    ["#", (r) => <b key="n" className="num">{r.rank}</b>],
    [tr("sales"), (r) => <span key="s"><b>{r.name}</b><small className="hint">{r.tl ? tr("targets.teamOf", { team: r.team ?? "", tl: r.tl }) : ""}</small></span>],
    [tr("targets.target"), (r) => <span key="t">{f.shows("value") && money(r.value)}{v.can.edit && <button className="btn ghost sm" onClick={() => setEdit(r)} aria-label={tr("targets.editOf", { name: r.name })}>{tr("targets.edit")}</button>}</span>],
    [tr("inTarget"), (r) => money(r.achieved), "achieved"],
    [tr("percent"), (r) => <div key="b" className="cell-bar"><b className="num">{Math.round(r.percent)}%</b><Bar pct={r.percent} tone={pctTone(r.percent, v.dayPercent)} /></div>, "percent"],
    ["Transactions", (r) => `${r.transactions} / ${r.deals}`],
    [tr("visits"), (r) => `${r.visitsDone} / ${r.visits}`],
    ["", (r) => <Status key="c" r={r} v={v} />],
  ];
  const shown = cols.filter(([, , k]) => !k || f.shows(k));
  const teamCols: [string, (x: TeamRow) => ReactNode, string?][] = [
    [tr("targets.team"), (x) => <b key="t">{tr("teamName", { team: x.team ?? "", tl: x.tl })}</b>],
    [tr("teamGoal"), (x) => money(x.goal), "goal"], [tr("teamAchieved"), (x) => money(x.achieved), "achieved"],
    [tr("percent"), (x) => `${Math.round(x.percent)}%`, "percent"], [tr("targets.salesAvg"), (x) => `${Math.round(x.avg)}%`, "avg"],
  ];
  const teamShown = teamCols.filter(([, , k]) => !k || f.shows(k));
  return (
    <>
      <div className="toolbar">
        <label className="date-f"><span>{tr("month")}</span><input type="month" value={month || v.month} onChange={(e) => setMonth(e.target.value)} aria-label={tr("month")} /></label>
        <span className="hint">{serverText(v.label)}</span>
      </div>
      {tl ? <TeamLeaders v={v} /> : (
        <>
          <Note>{tr.rich("targets.dayNote", { pct: String(v.dayPercent), b: bold })}</Note>
          <Table head={shown.map(([h]) => h)} empty={tr("noSales")} rows={v.rows.map((r) => shown.map(([, cell]) => cell(r)))} />
          <Card title={tr("targets.teamAvg")} icon="users">
            <Table head={teamShown.map(([h]) => h)} empty={tr("targets.noTeams")} rows={v.teams.map((x) => teamShown.map(([, cell]) => cell(x)))} />
          </Card>
          <Transactions key={v.month} month={v.month} />
        </>
      )}
      {edit && <TargetForm r={edit} month={v.month} onClose={() => setEdit(null)} />}
    </>
  );
}

function Status({ r, v }: { r: TargetRow; v: TargetsView }) {
  const tr = useTranslations("reports.status");
  const run = useAction(), qc = useQueryClient();
  const approve = () => void run(async () => { await api.post(`/reports/targets/${r.employeeId}/${v.month}/approve`); await qc.invalidateQueries({ queryKey: ["reports"] }); }, tr("approved"));
  if (r.pending) return <span className="row"><Chip tone="warn" plain>{tr("pending", { value: money(r.pending.value), by: r.pending.by })}</Chip>{v.can.approve && <button className="btn ghost sm" onClick={approve}><Icon name="check" />{tr("approve")}</button>}</span>;
  return r.behind ? <Chip tone="bad">{tr("behind")}</Chip> : r.percent >= 100 ? <Chip tone="ok">{tr("hit")}</Chip> : null;
}

function TargetForm({ r, month, onClose }: { r: TargetRow; month: string; onClose: () => void }) {
  const tr = useTranslations("reports");
  const run = useAction(), qc = useQueryClient();
  const f = useFields("reports");
  const save = (d: FormData) => void run(async () => {
    const res = await api.put<{ pending: boolean }>("/reports/targets", { employeeId: r.employeeId, month, value: String(d.get("value") ?? (r.value || "0")), deals: Number(d.get("deals")), visits: Number(d.get("visits")) });
    await qc.invalidateQueries({ queryKey: ["reports"] });
    onClose();
    if (res.pending) alert(tr("targetForm.pending"));
  }, tr("targetForm.saved"));
  return (
    <Modal title={tr("targetForm.title", { name: r.name })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        {/* M-09: a hidden value has no input, a read-only one is locked (the API keeps the stored value either way) */}
        {f.shows("value") && (f.edits("value") ? <Field label={tr("targets.target")} req><input name="value" type="number" min="0" step="0.01" defaultValue={Number(r.value)} required /></Field>
          : <fieldset className="field-lock" disabled><Field label={tr("targets.target")}><input type="number" defaultValue={Number(r.value)} /></Field></fieldset>)}
        <Field label="Transactions" req><input name="deals" type="number" min="0" defaultValue={r.deals} required /></Field>
        <Field label={tr("visits")} req><input name="visits" type="number" min="0" defaultValue={r.visits} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{tr("cancel")}</button><button className="btn"><Icon name="check" />{tr("save")}</button></div>
      </form>
    </Modal>
  );
}

function Transactions({ month }: { month: string }) {
  const tr = useTranslations("reports");
  const [range, setRange] = useState<[string, string] | null>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }), last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [from, to] = range ?? [`${month}-01`, today < last ? today : last];
  const q = useQuery({ queryKey: ["reports", "tx", from, to], queryFn: () => api.get<TransactionRow[]>(`/reports/transactions?from=${from}&to=${to}`) });
  const collected = useFields("reports").shows("collected");
  return (
    <Card title={tr("tx.title")} icon="file" sub={tr("tx.sub")} extra={<Chip tone="info">{q.data?.length ?? 0}</Chip>}>
      <div className="toolbar">
        <label className="date-f"><span>{tr("tx.from")}</span><input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} aria-label={tr("tx.from")} /></label>
        <label className="date-f"><span>{tr("tx.to")}</span><input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} aria-label={tr("tx.to")} /></label>
      </div>
      <Table head={[tr("tx.deal"), tr("tx.type"), tr("tx.client"), tr("sales"), ...(collected ? [tr("tx.collected")] : []), tr("tx.firstAt"), tr("tx.status")]} empty={tr("tx.empty")}
        rows={(q.data ?? []).map((x) => [<b key="c" className="mono">{x.code}</b>, serverText(x.type), x.company, x.people, ...(collected ? [money(x.collected)] : []), day(x.firstAt), serverText(x.status)])} />
    </Card>
  );
}

/** voice note 6: each TL's team, the team target (sum of its salespeople's), what's achieved, and the TL's tier. */
function TeamLeaders({ v }: { v: TargetsView }) {
  const tr = useTranslations("reports");
  const f = useFields("reports"); // M-09: a hidden field's column and tile are left out (the API blanks them anyway)
  if (!v.teams.length) return <Card><Empty text={tr("tl.empty")} icon="users" /></Card>;
  const cols: [string, (r: TargetRow) => ReactNode, string?][] = [
    [tr("sales"), (r) => <b key="n">{r.name}</b>], [tr("tl.target"), (r) => money(r.value), "value"], [tr("inTarget"), (r) => money(r.achieved), "achieved"],
    [tr("percent"), (r) => <div key="b" className="cell-bar"><b className="num">{Math.round(r.percent)}%</b><Bar pct={r.percent} tone="" /></div>, "percent"],
  ];
  const shown = cols.filter(([, , k]) => !k || f.shows(k));
  return (
    <>
      {v.teams.map((x) => (
        <Card key={x.tlId} title={x.team ? tr("teamName", { team: x.team, tl: x.tl }) : x.tl} icon="users" sub={tr("tl.sub", { count: x.members.length, n: String(x.members.length), goal: money(x.goal) })}
          extra={f.shows("percent") && f.shows("tierPercent") && <Chip tone={x.percent >= 100 ? "ok" : x.percent >= 70 ? "info" : "warn"}>{tr("tl.chip", { pct: String(Math.round(x.percent)), tier: String(x.tierPercent) })}</Chip>}>
          <Table head={shown.map(([h]) => h)} rows={v.rows.filter((r) => x.members.includes(r.employeeId)).map((r) => shown.map(([, cell]) => cell(r)))} />
          <div className="kpis sm">
            {f.shows("goal") && <KpiTile label={tr("teamGoal")} value={money(x.goal)} sub={tr("tl.goalSub")} icon="trend" />}
            {f.shows("achieved") && <KpiTile label={tr("teamAchieved")} value={money(x.achieved)} sub={tr("tl.achievedSub", { pct: String(Math.round(x.percent)) })} icon="check" tone={x.percent >= 70 ? "ok" : "warn"} />}
            {f.shows("tierPercent") && <KpiTile label={tr("tl.tier")} value={`${x.tierPercent}%`} sub={tr("tl.tierSub")} icon="star" />}
            {f.shows("commission") && <KpiTile label={tr("tl.commission")} value={money(x.commission)} sub={tr("tl.commissionSub")} icon="wallet" tone="ok" />}
          </div>
        </Card>
      ))}
    </>
  );
}

// ───────── 11.10 «التقارير ومواعيدها» ─────────

const blank = (name: string): ScheduledReportView => ({
  id: "", name, on: true, kind: "handin", freq: "daily", day: 0, time: "12:00", fmt: FMT[0], content: null, preparedBy: [], recipients: [],
  remindMin: 60, lateNotify: [], money: false, daily: false, next: "", handed: null, kpiItems: [], runs: [],
});

function Schedules() {
  const tr = useTranslations("reports");
  const q = useQuery({ queryKey: ["reports", "scheduled"], queryFn: () => api.get<ReportsData>("/reports/scheduled") });
  const [draft, setDraft] = useState<ScheduledReportView | null>(null);
  if (!q.data) return <Empty text={tr("loading")} />;
  return (
    <>
      <Note>{tr("sched.note")}</Note>
      {/* keyed by what the server recomputes too, so a saved card shows the new «next» and its runs */}
      {q.data.reports.map((r) => <ReportCard key={`${r.id}:${r.next}:${r.runs.length}`} r={r} d={q.data} />)}
      {draft && <ReportCard r={draft} d={q.data} onDone={() => setDraft(null)} />}
      {q.data.can.edit && !draft && <div className="row end"><button className="btn ghost" onClick={() => setDraft(blank(tr("sched.newReport")))}><Icon name="plus" />{tr("sched.newReport")}</button></div>}
    </>
  );
}

function when(t: T, r: ScheduledReportView) {
  return r.freq === "daily" ? t("when.daily", { time: r.time }) : r.freq === "weekly" ? t("when.weekly", { day: weekdays(t)[r.day] ?? "", time: r.time })
    : r.freq === "monthly" ? t("when.monthly", { day: String(r.day), time: r.time }) : t("when.quarterly", { day: String(r.day), time: r.time });
}

function ReportCard({ r, d, onDone }: { r: ScheduledReportView; d: ReportsData; onDone?: () => void }) {
  const tr = useTranslations("reports");
  const [x, setX] = useState(r);
  const run = useAction(), qc = useQueryClient();
  const ed = d.can.edit, o = d.options, hand = x.kind === "handin";
  const WD = weekdays(tr);
  const nameOf = (k: string) => (k === "follower" ? tr("sched.follower") : o?.people.find((p) => p.id === k)?.name ?? serverText(o?.roles.find((p) => p.key === k)?.label ?? k));
  const names = (l: string[]) => l.map(nameOf).join(tr("sep")) || "—";
  const set = <K extends keyof ScheduledReportView>(k: K, v: ScheduledReportView[K]) => setX((p) => ({ ...p, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] });
  const save = () => void run(async () => {
    const { name, on, kind, freq, day: d0, time, fmt, content, preparedBy, recipients, remindMin, lateNotify, money: m } = x;
    const payload: ReportInput = { name, on, kind, freq, day: d0, time, fmt, content, preparedBy, recipients, remindMin, lateNotify, money: m, kpiItems: x.kpiItems.map((k) => k.id) };
    if (x.id) await api.put(`/reports/scheduled/${x.id}`, payload); else await api.post("/reports/scheduled", payload);
    await refresh(); onDone?.();
  }, tr("sched.saved"));
  const del = () => { if (confirm(tr("sched.confirmDelete", { name: x.name }))) void run(async () => { await api.del(`/reports/scheduled/${x.id}`); await refresh(); }, tr("sched.deleted")); };
  const extra = [["follower", tr("sched.follower")]] as const;
  const who = (k: "preparedBy" | "recipients" | "lateNotify", label: string, follower: boolean) => (
    <div className="field wide"><span>{label}</span>
      <div className="row">
        {x[k].map((v) => <span key={v} className="chip plain">{nameOf(v)}{ed && <button className="icon-btn" onClick={() => set(k, x[k].filter((y) => y !== v))} aria-label={tr("sched.remove", { name: nameOf(v) })}>✕</button>}</span>)}
        {!x[k].length && <span className="hint">{tr("sched.nobody")}</span>}
        {ed && o && <select value="" aria-label={label} onChange={(e) => e.target.value && set(k, [...x[k], e.target.value])}>
          <option value="">{tr("sched.add")}</option>
          {follower && extra.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          <optgroup label={tr("sched.roles")}>{o.roles.filter((p) => !x[k].includes(p.key)).map((p) => <option key={p.key} value={p.key}>{serverText(p.label)}</option>)}</optgroup>
          <optgroup label={tr("sched.people")}>{o.people.filter((p) => !x[k].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>}
      </div>
    </div>
  );
  return (
    <Card title={x.name} icon={hand ? "upload" : "send"} extra={<label className="tog"><input type="checkbox" checked={x.on} disabled={!ed} onChange={(e) => set("on", e.target.checked)} /><span>{tr("sched.on")}</span></label>}>
      <p className="rule-says"><Icon name="bolt" /><span>
        {x.daily && tr("sched.dailySays")}
        {hand ? <>{tr.rich("sched.handSays", { b: bold, when: when(tr, x), prep: names(x.preparedBy), to: names(x.recipients), min: String(x.remindMin), late: names(x.lateNotify) })}{x.kpiItems.length ? tr("sched.kpiCounted", { items: x.kpiItems.map((k) => tr("sched.quote", { label: serverText(k.label) })).join(tr("sep")) }) : tr("sched.kpiNone")}</>
          : tr.rich("sched.autoSays", { b: bold, when: when(tr, x), fmt: fmtLabel(tr, x.fmt), to: names(x.recipients) })}
        {x.next && tr("sched.next", { at: dayTime(x.next) })}{x.handed && tr("sched.handed", { got: String(x.handed.got), of: String(x.handed.of) })}
      </span></p>
      {ed && (
        <div className="grid">
          <Field label={tr("sched.name")}><input value={x.name} onChange={(e) => set("name", e.target.value)} aria-label={tr("sched.nameLabel")} /></Field>
          <Field label={tr("sched.kind")}><select value={x.kind} onChange={(e) => setX((p) => ({ ...p, kind: e.target.value as ReportInput["kind"], content: e.target.value === "auto" ? "performance" : null }))}>
            <option value="auto">{tr("sched.kindAuto")}</option><option value="handin">{tr("sched.kindHandin")}</option></select></Field>
          <Field label={tr("sched.freq")}><select value={x.freq} onChange={(e) => setX((p) => ({ ...p, freq: e.target.value as ReportInput["freq"], day: e.target.value === "weekly" ? 0 : e.target.value === "daily" ? 0 : 1 }))}>
            {FREQS.map((k) => <option key={k} value={k}>{tr(`freq.${k}`)}</option>)}</select></Field>
          {x.freq !== "daily" && <Field label={x.freq === "weekly" ? tr("sched.weekday") : tr("sched.monthDay")}><select value={x.day} onChange={(e) => set("day", Number(e.target.value))}>
            {(x.freq === "weekly" ? WD.map((w, i) => [i, w] as const) : Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)] as const)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
          <Field label={hand ? tr("sched.deadline") : tr("sched.hour")}><input type="time" value={x.time} onChange={(e) => e.target.value && set("time", e.target.value)} aria-label={tr("sched.hour")} /></Field>
          <Field label={tr("sched.fmt")}><select value={x.fmt} onChange={(e) => set("fmt", e.target.value as ReportInput["fmt"])}>{FMT.map((f) => <option key={f} value={f}>{fmtLabel(tr, f)}</option>)}</select></Field>
          {!hand && <Field label={tr("sched.sends")}><select value={x.content ?? "performance"} onChange={(e) => set("content", e.target.value as NonNullable<ReportInput["content"]>)}><option value="performance">{tr("sched.performance")}</option><option value="inventory">{tr("sched.inventory")}</option></select></Field>}
          {hand && <Field label={tr("sched.remind")}><input type="number" min="0" value={x.remindMin} onChange={(e) => set("remindMin", Math.max(0, Number(e.target.value) || 0))} aria-label={tr("sched.remindLabel")} /></Field>}
          {hand && o && <div className="field wide"><span>{tr("sched.kpiItem")}</span><div className="row">
            {x.kpiItems.map((k) => <span key={k.id} className="chip plain">{serverText(k.label)}<button className="icon-btn" onClick={() => set("kpiItems", x.kpiItems.filter((y) => y.id !== k.id))} aria-label={tr("sched.remove", { name: serverText(k.label) })}>✕</button></span>)}
            <select value="" aria-label={tr("sched.kpiItemLabel")} onChange={(e) => { const it = o.items.find((i) => i.id === e.target.value); if (it) set("kpiItems", [...x.kpiItems, it]); }}>
              <option value="">{x.kpiItems.length ? tr("sched.addItem") : tr("sched.notLinked")}</option>
              {o.items.filter((i) => !x.kpiItems.some((k) => k.id === i.id)).map((i) => <option key={i.id} value={i.id}>{serverText(i.label)}</option>)}
            </select></div></div>}
          {(hand || x.content === "inventory") && who("preparedBy", hand ? tr("sched.preparedBy") : tr("sched.approvedBy"), false)}
          {who("recipients", tr("sched.recipients"), hand)}
          {hand && who("lateNotify", tr("sched.lateNotify"), true)}
          <label className="tog wide"><input type="checkbox" checked={x.money} onChange={(e) => set("money", e.target.checked)} /><span>{tr("sched.money")}</span></label>
        </div>
      )}
      {x.runs.length > 0 && (
        <div className="timeline">
          {x.runs.map((f) => <div key={f.id}><button className="btn ghost sm" onClick={() => void run(() => api.download(`/reports/runs/${f.id}/file`, `${f.title}.xlsx`))}><Icon name="file" />{serverText(f.title)}</button><small>{dayTime(f.at)}</small></div>)}
        </div>
      )}
      {ed && <div className="row end">
        {onDone && <button className="btn ghost sm" onClick={onDone}>{tr("cancel")}</button>}
        {x.id && <button className="btn ghost sm" onClick={del}><Icon name="x" />{tr("sched.delete")}</button>}
        <button className="btn sm" onClick={save}><Icon name="check" />{tr("save")}</button>
      </div>}
    </Card>
  );
}
