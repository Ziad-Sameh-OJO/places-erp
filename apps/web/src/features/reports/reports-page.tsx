"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportInput, ReportsPage as ReportsData, ScheduledReportView, TargetRow, TargetsView, TransactionRow } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Tabs, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { day, dayTime, money } from "@/lib/format";
import { Bar } from "@/features/kpis/kpis-page";

type Tab = "targets" | "tl" | "sched";
const WD = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
const FREQ: [ReportInput["freq"], string][] = [["daily", "كل يوم شغل"], ["weekly", "كل أسبوع"], ["monthly", "كل شهر"], ["quarterly", "كل ربع"]];
const FMT: ReportInput["fmt"][] = ["جوه السيستم", "PDF", "Excel"];
const pctTone = (p: number, dayPct: number) => (p < dayPct * 0.6 ? "bad" : p < dayPct ? "warn" : "");

/** M-12 · التقارير والتارجت (demo clients.js V.reports): التارجت والـ Transactions · الـ Team Leaders · التقارير ومواعيدها. */
export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("targets");
  return (
    <>
      <div className="row"><Tabs<Tab> items={[["targets", "التارجت والـ Transactions"], ["tl", "الـ Team Leaders"], ["sched", "التقارير ومواعيدها"]]} value={tab} onChange={setTab} /></div>
      {tab === "sched" ? <Schedules /> : <Targets tl={tab === "tl"} />}
    </>
  );
}

function Targets({ tl }: { tl: boolean }) {
  const [month, setMonth] = useState("");
  const q = useQuery({ queryKey: ["reports", "targets", month], queryFn: () => api.get<TargetsView>(`/reports/targets${month ? `?month=${month}` : ""}`) });
  const [edit, setEdit] = useState<TargetRow | null>(null);
  if (!q.data) return <Empty text="بيحمّل…" />;
  const v = q.data;
  return (
    <>
      <div className="toolbar">
        <label className="date-f"><span>الشهر</span><input type="month" value={month || v.month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر" /></label>
        <span className="hint">{v.label}</span>
      </div>
      {tl ? <TeamLeaders v={v} /> : (
        <>
          <Note>النهارده عدّى <b>{v.dayPercent}%</b> من الشهر. اللي تحت المعدل ده بيوصل للـ TL بتاعه تنبيه.</Note>
          <Table head={["#", "السيلز", "التارجت (نصيبه من الكوميشن)", "دخل في التارجت", "النسبة", "Transactions", "زيارات", ""]} empty="مفيش سيلز"
            rows={v.rows.map((r) => [
              <b key="n" className="num">{r.rank}</b>,
              <span key="s"><b>{r.name}</b><small className="hint">{r.tl ? ` · فريق ${r.team ?? ""} (${r.tl})` : ""}</small></span>,
              <span key="t">{money(r.value)}{v.can.edit && <button className="btn ghost sm" onClick={() => setEdit(r)} aria-label={`عدّل تارجت ${r.name}`}>عدّل</button>}</span>,
              money(r.achieved),
              <div key="b" className="cell-bar"><b className="num">{Math.round(r.percent)}%</b><Bar pct={r.percent} tone={pctTone(r.percent, v.dayPercent)} /></div>,
              `${r.transactions} / ${r.deals}`, `${r.visitsDone} / ${r.visits}`,
              <Status key="c" r={r} v={v} />,
            ])} />
          <Card title="متوسط كل فريق" icon="users">
            <Table head={["الفريق", "تارجت الفريق", "الفريق محقق", "النسبة", "متوسط السيلز"]} empty="مفيش فرق"
              rows={v.teams.map((t) => [<b key="t">فريق {t.team ?? ""} · {t.tl}</b>, money(t.goal), money(t.achieved), `${Math.round(t.percent)}%`, `${Math.round(t.avg)}%`])} />
          </Card>
          <Transactions key={v.month} month={v.month} />
        </>
      )}
      {edit && <TargetForm r={edit} month={v.month} onClose={() => setEdit(null)} />}
    </>
  );
}

function Status({ r, v }: { r: TargetRow; v: TargetsView }) {
  const run = useAction(), qc = useQueryClient();
  const approve = () => void run(async () => { await api.post(`/reports/targets/${r.employeeId}/${v.month}/approve`); await qc.invalidateQueries({ queryKey: ["reports"] }); }, "اتوافق على التارجت");
  if (r.pending) return <span className="row"><Chip tone="warn" plain>مستني موافقة: {money(r.pending.value)} · {r.pending.by}</Chip>{v.can.approve && <button className="btn ghost sm" onClick={approve}><Icon name="check" />وافق</button>}</span>;
  return r.behind ? <Chip tone="bad">تحت المعدل</Chip> : r.percent >= 100 ? <Chip tone="ok">حقق التارجت</Chip> : null;
}

function TargetForm({ r, month, onClose }: { r: TargetRow; month: string; onClose: () => void }) {
  const run = useAction(), qc = useQueryClient();
  const save = (d: FormData) => void run(async () => {
    const res = await api.put<{ pending: boolean }>("/reports/targets", { employeeId: r.employeeId, month, value: String(d.get("value")), deals: Number(d.get("deals")), visits: Number(d.get("visits")) });
    await qc.invalidateQueries({ queryKey: ["reports"] });
    onClose();
    if (res.pending) alert("التغيير في نص الشهر · مستني موافقة");
  }, "التارجت اتحفظ");
  return (
    <Modal title={`تارجت ${r.name}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="التارجت (نصيبه من الكوميشن)" req><input name="value" type="number" min="0" step="0.01" defaultValue={Number(r.value)} required /></Field>
        <Field label="Transactions" req><input name="deals" type="number" min="0" defaultValue={r.deals} required /></Field>
        <Field label="زيارات" req><input name="visits" type="number" min="0" defaultValue={r.visits} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="check" />احفظ</button></div>
      </form>
    </Modal>
  );
}

function Transactions({ month }: { month: string }) {
  const [range, setRange] = useState<[string, string] | null>(null);
  const today = new Date().toISOString().slice(0, 10), last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [from, to] = range ?? [`${month}-01`, today < last ? today : last];
  const q = useQuery({ queryKey: ["reports", "tx", from, to], queryFn: () => api.get<TransactionRow[]>(`/reports/transactions?from=${from}&to=${to}`) });
  return (
    <Card title="الـ Transactions" icon="file" sub="الصفقات اللي أول تحصيل فيها جه في الفترة" extra={<Chip tone="info">{q.data?.length ?? 0}</Chip>}>
      <div className="toolbar">
        <label className="date-f"><span>من</span><input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} aria-label="من" /></label>
        <label className="date-f"><span>لحد</span><input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} aria-label="لحد" /></label>
      </div>
      <Table head={["الصفقة", "النوع", "العميل", "السيلز", "اتحصّل", "أول تحصيل", "الحالة"]} empty="مفيش Transactions في الفترة دي"
        rows={(q.data ?? []).map((t) => [<b key="c" className="mono">{t.code}</b>, t.type, t.company, t.people, money(t.collected), day(t.firstAt), t.status])} />
    </Card>
  );
}

/** voice note 6: each TL's team, the team target (sum of its salespeople's), what's achieved, and the TL's tier. */
function TeamLeaders({ v }: { v: TargetsView }) {
  if (!v.teams.length) return <Card><Empty text="مفيش فرق في الشهر ده" icon="users" /></Card>;
  return (
    <>
      {v.teams.map((t) => (
        <Card key={t.tlId} title={t.team ? `فريق ${t.team} · ${t.tl}` : t.tl} icon="users" sub={`${t.members.length} سيلز · تارجت الفريق ${money(t.goal)}`}
          extra={<Chip tone={t.percent >= 100 ? "ok" : t.percent >= 70 ? "info" : "warn"}>{Math.round(t.percent)}% · شريحة {t.tierPercent}%</Chip>}>
          <Table head={["السيلز", "التارجت", "دخل في التارجت", "النسبة"]}
            rows={v.rows.filter((r) => t.members.includes(r.employeeId)).map((r) => [<b key="n">{r.name}</b>, money(r.value), money(r.achieved),
              <div key="b" className="cell-bar"><b className="num">{Math.round(r.percent)}%</b><Bar pct={r.percent} tone="" /></div>])} />
          <div className="kpis sm">
            <KpiTile label="تارجت الفريق" value={money(t.goal)} sub="مجموع تارجت السيلز" icon="trend" />
            <KpiTile label="الفريق محقق" value={money(t.achieved)} sub={`${Math.round(t.percent)}% من تارجت الفريق`} icon="check" tone={t.percent >= 70 ? "ok" : "warn"} />
            <KpiTile label="نسبة الـ TL" value={`${t.tierPercent}%`} sub="من نصيب كل سيلز في فريقه" icon="star" />
            <KpiTile label="عمولة الـ TL" value={money(t.commission)} sub="لحد دلوقتي" icon="wallet" tone="ok" />
          </div>
        </Card>
      ))}
    </>
  );
}

// ───────── 11.10 «التقارير ومواعيدها» ─────────

const blank = (): ScheduledReportView => ({
  id: "", name: "تقرير جديد", on: true, kind: "handin", freq: "daily", day: 0, time: "12:00", fmt: "جوه السيستم", content: null, preparedBy: [], recipients: [],
  remindMin: 60, lateNotify: [], money: false, daily: false, next: "", handed: null, kpiItems: [], runs: [],
});

function Schedules() {
  const q = useQuery({ queryKey: ["reports", "scheduled"], queryFn: () => api.get<ReportsData>("/reports/scheduled") });
  const [draft, setDraft] = useState<ScheduledReportView | null>(null);
  if (!q.data) return <Empty text="بيحمّل…" />;
  return (
    <>
      <Note>كل تقرير: إمتى بيتعمل، مين بيحضّره ومين بيستلمه، والتذكير قبل الميعاد، ومين يتبلّغ لو اتأخر، وبيتحسب في أنهي بند KPIs. السيستم بيشتغل بالمواعيد دي على طول. الإيميل لسه مش متوصّل: التقرير بيوصل إشعار جوه السيستم وملفه بيتنزل من هنا.</Note>
      {q.data.reports.map((r) => <ReportCard key={r.id} r={r} d={q.data} />)}
      {draft && <ReportCard r={draft} d={q.data} onDone={() => setDraft(null)} />}
      {q.data.can.edit && !draft && <div className="row end"><button className="btn ghost" onClick={() => setDraft(blank())}><Icon name="plus" />تقرير جديد</button></div>}
    </>
  );
}

function when(r: ScheduledReportView) {
  return r.freq === "daily" ? `كل يوم شغل الساعة ${r.time}` : r.freq === "weekly" ? `كل ${WD[r.day]} الساعة ${r.time}` : r.freq === "monthly" ? `يوم ${r.day} من كل شهر الساعة ${r.time}` : `يوم ${r.day} من أول شهر في كل ربع الساعة ${r.time}`;
}

function ReportCard({ r, d, onDone }: { r: ScheduledReportView; d: ReportsData; onDone?: () => void }) {
  const [x, setX] = useState(r);
  const run = useAction(), qc = useQueryClient();
  const ed = d.can.edit, o = d.options, hand = x.kind === "handin";
  const nameOf = (k: string) => (k === "follower" ? "المتابع بتاع الشخص" : o?.people.find((p) => p.id === k)?.name ?? o?.roles.find((p) => p.key === k)?.label ?? k);
  const names = (l: string[]) => l.map(nameOf).join("، ") || "—";
  const set = <K extends keyof ScheduledReportView>(k: K, v: ScheduledReportView[K]) => setX((p) => ({ ...p, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] });
  const save = () => void run(async () => {
    const { name, on, kind, freq, day: d0, time, fmt, content, preparedBy, recipients, remindMin, lateNotify, money: m } = x;
    const payload: ReportInput = { name, on, kind, freq, day: d0, time, fmt, content, preparedBy, recipients, remindMin, lateNotify, money: m, kpiItems: x.kpiItems.map((k) => k.id) };
    if (x.id) await api.put(`/reports/scheduled/${x.id}`, payload); else await api.post("/reports/scheduled", payload);
    await refresh(); onDone?.();
  }, "اتحفظ · بيتطبّق على طول");
  const del = () => { if (confirm(`تمسح «${x.name}»؟`)) void run(async () => { await api.del(`/reports/scheduled/${x.id}`); await refresh(); }, "اتمسح"); };
  const extra = [["follower", "المتابع بتاع الشخص"]] as const;
  const who = (k: "preparedBy" | "recipients" | "lateNotify", label: string, follower: boolean) => (
    <div className="field wide"><span>{label}</span>
      <div className="row">
        {x[k].map((v) => <span key={v} className="chip plain">{nameOf(v)}{ed && <button className="icon-btn" onClick={() => set(k, x[k].filter((y) => y !== v))} aria-label={`شيل ${nameOf(v)}`}>✕</button>}</span>)}
        {!x[k].length && <span className="hint">محدش</span>}
        {ed && o && <select value="" aria-label={label} onChange={(e) => e.target.value && set(k, [...x[k], e.target.value])}>
          <option value="">ضيف…</option>
          {follower && extra.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          <optgroup label="أدوار">{o.roles.filter((p) => !x[k].includes(p.key)).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
          <optgroup label="أشخاص">{o.people.filter((p) => !x[k].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>}
      </div>
    </div>
  );
  return (
    <Card title={x.name} icon={hand ? "upload" : "send"} extra={<label className="tog"><input type="checkbox" checked={x.on} disabled={!ed} onChange={(e) => set("on", e.target.checked)} /><span>شغال</span></label>}>
      <p className="rule-says"><Icon name="bolt" /><span>
        {x.daily && "كل واحد بيكتب فيه عمل إيه النهارده: السيستم بيملا الأرقام اللي يعرفها وهو بيكتب الباقي، وبيتجمع يومي وأسبوعي وشهري في الـ KPIs بتاعته. "}
        {hand ? <><b>{when(x)}</b> لازم <b>{names(x.preparedBy)}</b> يسلّم التقرير ده لـ <b>{names(x.recipients)}</b>. قبل الميعاد بـ {x.remindMin} دقيقة بيجيله تذكير، ولو اتأخر بيتبلّغ <b>{names(x.lateNotify)}</b>. {x.kpiItems.length ? `التسليم في الميعاد بيتحسب في الـ KPIs (${x.kpiItems.map((k) => `«${k.label}»`).join("، ")}).` : "مش مربوط ببند KPIs."}</>
          : <><b>{when(x)}</b> السيستم بيبعت التقرير ده ({x.fmt}) لـ <b>{names(x.recipients)}</b>.</>}
        {x.next && <> الجاي: {dayTime(x.next)}.</>}{x.handed && <> · الفترة دي: سلّم {x.handed.got} من {x.handed.of}</>}
      </span></p>
      {ed && (
        <div className="grid">
          <Field label="الاسم"><input value={x.name} onChange={(e) => set("name", e.target.value)} aria-label="اسم التقرير" /></Field>
          <Field label="النوع"><select value={x.kind} onChange={(e) => setX((p) => ({ ...p, kind: e.target.value as ReportInput["kind"], content: e.target.value === "auto" ? "performance" : null }))}>
            <option value="auto">السيستم بيبعته أوتوماتيك</option><option value="handin">شخص بيسلّمه</option></select></Field>
          <Field label="كل قد إيه"><select value={x.freq} onChange={(e) => setX((p) => ({ ...p, freq: e.target.value as ReportInput["freq"], day: e.target.value === "weekly" ? 0 : e.target.value === "daily" ? 0 : 1 }))}>
            {FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {x.freq !== "daily" && <Field label={x.freq === "weekly" ? "اليوم" : "يوم كام في الشهر"}><select value={x.day} onChange={(e) => set("day", Number(e.target.value))}>
            {(x.freq === "weekly" ? WD.map((w, i) => [i, w] as const) : Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)] as const)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
          <Field label={hand ? "آخر ميعاد للتسليم" : "الساعة"}><input type="time" value={x.time} onChange={(e) => e.target.value && set("time", e.target.value)} aria-label="الساعة" /></Field>
          <Field label="الشكل"><select value={x.fmt} onChange={(e) => set("fmt", e.target.value as ReportInput["fmt"])}>{FMT.map((f) => <option key={f}>{f}</option>)}</select></Field>
          {!hand && <Field label="السيستم بيبعت"><select value={x.content ?? "performance"} onChange={(e) => set("content", e.target.value as NonNullable<ReportInput["content"]>)}><option value="performance">أداء كل سيلز وفريق + المقارنة بالفترة اللي قبلها</option><option value="inventory">تقرير الانفنتوري اليومي (جديد / متحدّث / اتأجر / مش مؤكد) · اللي بيحضّره بيعتمده الأول</option></select></Field>}
          {hand && <Field label="التذكير قبل الميعاد بـ (دقيقة)"><input type="number" min="0" value={x.remindMin} onChange={(e) => set("remindMin", Math.max(0, Number(e.target.value) || 0))} aria-label="التذكير بالدقايق" /></Field>}
          {hand && o && <div className="field wide"><span>بيتحسب في بند KPIs</span><div className="row">
            {x.kpiItems.map((k) => <span key={k.id} className="chip plain">{k.label}<button className="icon-btn" onClick={() => set("kpiItems", x.kpiItems.filter((y) => y.id !== k.id))} aria-label={`شيل ${k.label}`}>✕</button></span>)}
            <select value="" aria-label="بند الـ KPIs" onChange={(e) => { const it = o.items.find((i) => i.id === e.target.value); if (it) set("kpiItems", [...x.kpiItems, it]); }}>
              <option value="">{x.kpiItems.length ? "ضيف بند…" : "مش مربوط"}</option>
              {o.items.filter((i) => !x.kpiItems.some((k) => k.id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select></div></div>}
          {(hand || x.content === "inventory") && who("preparedBy", hand ? "مين بيحضّره ويسلّمه" : "مين بيعتمده قبل ما يتبعت", false)}
          {who("recipients", "مين بيستلمه", hand)}
          {hand && who("lateNotify", "لو اتأخر يتبلّغ", true)}
          <label className="tog wide"><input type="checkbox" checked={x.money} onChange={(e) => set("money", e.target.checked)} /><span>فيه أرقام فلوس (مايظهرش لمسؤول الـ KPIs)</span></label>
        </div>
      )}
      {x.runs.length > 0 && (
        <div className="timeline">
          {x.runs.map((f) => <div key={f.id}><button className="btn ghost sm" onClick={() => void run(() => api.download(`/reports/runs/${f.id}/file`, `${f.title}.xlsx`))}><Icon name="file" />{f.title}</button><small>{dayTime(f.at)}</small></div>)}
        </div>
      )}
      {ed && <div className="row end">
        {onDone && <button className="btn ghost sm" onClick={onDone}>إلغاء</button>}
        {x.id && <button className="btn ghost sm" onClick={del}><Icon name="x" />امسح التقرير</button>}
        <button className="btn sm" onClick={save}><Icon name="check" />احفظ</button>
      </div>}
    </Card>
  );
}
