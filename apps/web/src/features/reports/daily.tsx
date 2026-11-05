"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DailyForm, DayReport, MyHandIn } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

/** M-12 · 11.12 the daily report (demo kpis.js «التقارير اليومية») and the home's hand-ins (11.10 «سلّم»). */

const hm = (iso: string) => new Date(iso).toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" });
const STATUS: Record<DailyForm["status"], [string, "ok" | "warn" | "bad" | ""]> = {
  onTime: ["اتسلّم في الميعاد", "ok"], late: ["اتسلّم متأخر", "warn"], missing: ["ماسلّمش تقرير اليوم ده", "bad"], off: ["يوم أجازة", ""], open: ["لسه ماتسلّمش", ""],
};

/** The form exactly as the person sees it; `preview` = the same form, disabled, for whoever looks at it. */
function FormFields({ f, preview }: { f: DailyForm; preview?: boolean }) {
  const v = f.saved?.values ?? {};
  return (
    <>
      {f.items.length > 0 && <div className="wide"><Table head={["البند", "النهارده", ""]} rows={f.items.map((it) => [
        <span key="t"><b>{it.title}</b><small className="sub">{it.target}</small></span>,
        it.auto ? <b key="v">{it.value ?? "—"}</b> : <input key="v" type="number" min="0" step="any" name={`v:${it.key}`} defaultValue={v[it.key] ?? ""} disabled={preview} style={{ width: 90 }} aria-label={it.title} />,
        <span key="h" className="hint">{it.auto ? "من السيستم" : "اكتبه إنت"}</span>,
      ])} /></div>}
      {f.fields.map((x) => <Field key={x.id} label={x.label} wide>
        <input name={`f:${x.id}`} type={x.type === "number" ? "number" : "text"} min={0} step="any" defaultValue={v[x.id] ?? ""} disabled={preview} />
      </Field>)}
      <Field label="عملت إيه تاني النهارده؟" wide><textarea name="note" defaultValue={f.saved?.note ?? ""} disabled={preview} /></Field>
    </>
  );
}

function DailyModal({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ["reports", "daily", "me"], queryFn: () => api.get<DailyForm>("/reports/daily/me") });
  const run = useAction(), qc = useQueryClient();
  const send = (d: FormData) => void run(async () => {
    const values: Record<string, number | string> = {};
    for (const [k, raw] of d.entries()) {
      const s = String(raw).trim();
      if (!s || k === "note") continue;
      const [kind, key] = k.split(":") as [string, string];
      const field = q.data?.fields.find((x) => x.id === key);
      values[key] = kind === "v" || field?.type === "number" ? Number(s) : s;
    }
    const r = await api.post<{ onTime: boolean }>("/reports/daily", { values, note: String(d.get("note") ?? "") });
    await qc.invalidateQueries({ queryKey: ["reports"] });
    onClose();
    if (!r.onTime) alert("اتسلّم متأخر · مش هيتحسب في الـ KPIs");
  }, "التقرير اتسلّم");
  return (
    <Modal title="التقرير اليومي" onClose={onClose}>
      {!q.data ? <Empty text="بيحمّل…" /> : (
        <form className="grid" onSubmit={onFormSubmit(send)}>
          <FormFields f={q.data} />
          <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="send" />سلّم التقرير</button></div>
        </form>
      )}
    </Modal>
  );
}

/** The home's «سلّم» tasks: the hand-ins due today (demo «reportInbox»). */
export function MyHandIns() {
  const q = useQuery({ queryKey: ["reports", "mine"], queryFn: () => api.get<MyHandIn[]>("/reports/mine") });
  const run = useAction(), qc = useQueryClient();
  const [daily, setDaily] = useState(false);
  if (!q.data?.length) return null;
  const hand = (h: MyHandIn) => void run(async () => {
    const r = await api.post<{ onTime: boolean; counted: boolean }>(`/reports/scheduled/${h.reportId}/hand-in`);
    await qc.invalidateQueries({ queryKey: ["reports"] });
    if (!r.onTime) alert("اتسلّم متأخر · مش هيتحسب في الـ KPIs");
  }, h.kpi ? "اتسلّم · اتحسب في الـ KPIs" : "اتسلّم");
  return (
    <Card title="تقارير لازم تتسلّم النهارده" icon="upload" extra={<Chip tone="warn">{q.data.length}</Chip>}>
      {q.data.map((h) => (
        <div key={h.reportId} className="line-item">
          <span><b>سلّم «{h.name}»</b><small className="hint">{h.late ? "متأخر · " : ""}الميعاد {hm(h.due)}{h.kpi ? " · بيتحسب في الـ KPIs بتاعتك" : h.daily ? " · اللي عملته النهارده" : ""}</small></span>
          {h.daily ? <button className="btn sm" onClick={() => setDaily(true)}>اكتب التقرير</button> : <button className="btn sm" onClick={() => hand(h)}><Icon name="check" />سلّمت</button>}
        </div>
      ))}
      {daily && <DailyModal onClose={() => setDaily(false)} />}
    </Card>
  );
}

const useDay = (userId: string | null, day: string) => useQuery({
  queryKey: ["reports", "day", userId, day], queryFn: () => api.get<DayReport>(`/reports/daily/day?userId=${userId}${day ? `&day=${day}` : ""}`), enabled: !!userId, retry: false,
});

/** «التقارير اليومية» on the KPIs page: one person's report for any day, or the shape of his report. */
export function DailyBoard() {
  const { me } = useMe();
  const [pick, setPick] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [view, setView] = useState<"day" | "shape">("day");
  const first = useDay(me?.id ?? null, "");
  const id = pick ?? first.data?.team[0]?.userId ?? me?.id ?? null;
  const q = useDay(id, day);
  const d = q.data ?? (id === me?.id ? first.data : undefined);
  if (!d) return <Card><Empty text={q.isError ? "مفيش تقرير يومي شغال" : "بيحمّل…"} icon="list" /></Card>;
  const today = new Date().toISOString().slice(0, 10), shown = d.form.day, dayLbl = shown === today ? "النهارده" : new Date(shown).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
  const [label, tone] = STATUS[d.form.status];
  return (
    <Card title="التقارير اليومية" icon="list" extra={<Chip tone="info">بيتسلّم {d.time}</Chip>} sub={`بيروح لـ ${d.to} · بيتجمع يومي وأسبوعي وشهري وبيتحسب منه الـ KPIs`}>
      <div className="row">
        <select value={id ?? ""} onChange={(e) => setPick(e.target.value)} aria-label="الموظف">
          {(d.team.some((t) => t.userId === d.person.userId) ? d.team : [{ userId: d.person.userId, name: d.person.name, handed: false }, ...d.team]).map((t) => <option key={t.userId} value={t.userId}>{t.name}{t.handed ? " · سلّم" : ""}</option>)}
        </select>
        <div className="seg" role="group" aria-label="العرض">
          <button aria-pressed={view === "day"} onClick={() => setView("day")}>تقرير يوم</button>
          <button aria-pressed={view === "shape"} onClick={() => setView("shape")}>شكل التقرير</button>
        </div>
        {view === "day" && <>
          <label className="date-f"><span>يوم</span><input type="date" value={day || shown} max={today} onChange={(e) => setDay(e.target.value)} aria-label="اليوم" /></label>
          <span className="hint">سلّموا {dayLbl}: {d.team.filter((t) => t.handed).length} من {d.team.length}</span>
        </>}
      </div>
      {view === "shape" ? <Shape d={d} /> : (
        <>
          <section className="card flat">
            <div className="card-head"><h3><span className="ico"><Icon name="file" /></span><span>تقرير {d.person.name} · {dayLbl}</span></h3><Chip tone={tone}>{label}{d.form.saved ? ` · ${hm(d.form.saved.at)}` : ""}</Chip></div>
            {d.form.saved && d.form.fields.filter((f) => d.form.saved!.values[f.id] != null).map((f) => <p key={f.id}><b>{f.label}:</b> {d.form.saved!.values[f.id]}</p>)}
            {d.form.saved?.note && <div className="quote">{d.form.saved.note}</div>}
          </section>
          <Table head={["البند", dayLbl, "آخر 7 أيام", "الشهر", "الربع", "المستهدف", "التحقيق"]} empty="مفيش كارت KPIs"
            rows={d.rows.map((r) => [<span key="t"><b>{r.title}</b><small className="sub">{r.calc}</small></span>,
              <b key="d">{r.day ?? "—"}</b>, ...(r.week == null ? ["—", "—", "—"] : [r.week, r.month, r.quarter]), r.target, <b key="a">{Math.round(r.achievement)}%</b>])} />
        </>
      )}
    </Card>
  );
}

function Shape({ d }: { d: DayReport }) {
  const run = useAction(), qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports", "day"] });
  const add = (f: FormData) => void run(async () => { await api.post("/reports/daily/fields", { userId: d.person.userId, label: String(f.get("label")), type: String(f.get("type")) }); await refresh(); }, "اتضافت");
  const del = (id: string) => void run(async () => { await api.del(`/reports/daily/fields/${id}`); await refresh(); }, "اتشالت");
  const copy = () => { if (confirm("تنسخ الخانات الإضافية لكل اللي ليهم نفس الدور؟ اللي عندهم هيتبدل.")) void run(async () => { const r = await api.post<{ copied: number }>(`/reports/daily/fields/copy/${d.person.userId}`); await refresh(); alert(`اتنسخت لـ ${r.copied}`); }); };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="file" /></span><span>شكل التقرير اليومي · {d.person.name}<small>بيتسلّم كل يوم شغل الساعة {d.time} · بيروح لـ {d.to} · لو اتأخر يتبلّغ {d.late}</small></span></h3></div>
      <Table head={["الخانة", "بتتملي إزاي", "بتروح فين", ""]} rows={d.shape.map((x) => [<b key="l">{x.label}</b>, x.how, <span key="g" className="hint">{x.goes}</span>,
        x.fieldId && d.can.fields ? <button key="x" className="btn ghost sm" onClick={() => del(x.fieldId!)} aria-label={`امسح ${x.label}`}><Icon name="x" /></button> : ""])} />
      {d.can.fields && <>
        <form className="row" onSubmit={onFormSubmit(add)}>
          <input name="label" placeholder="خانة جديدة · مثلاً: عدد الملاك اللي كلمتهم" required aria-label="اسم الخانة" />
          <select name="type" aria-label="نوعها"><option value="number">رقم</option><option value="text">كلام</option></select>
          <button className="btn ghost"><Icon name="plus" />ضيف خانة</button>
          {d.form.fields.length > 0 && <button type="button" className="btn ghost sm" onClick={copy}>انسخ الخانات الإضافية لكل نفس الدور</button>}
        </form>
        <p className="hint">عشان رقم بيكتبه يتحسب في الـ KPIs: ضيف بند في الكارت، وخلّيه «اللي بيكتبه في التقرير اليومي».</p>
      </>}
      <h4 className="mini-h">ده شكله عنده</h4>
      <div className="grid report-preview"><FormFields f={d.form} preview /></div>
    </section>
  );
}
