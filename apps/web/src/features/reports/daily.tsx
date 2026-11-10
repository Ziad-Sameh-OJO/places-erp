"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { DailyForm, DayReport, MyHandIn } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/format";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";

/** M-12 · 11.12 the daily report (demo kpis.js «التقارير اليومية») and the home's hand-ins (11.10 «سلّم»). */

const hm = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" });
const STATUS_TONE: Record<DailyForm["status"], "ok" | "warn" | "bad" | ""> = { onTime: "ok", late: "warn", missing: "bad", off: "", open: "" };

/** The form exactly as the person sees it; `preview` = the same form, disabled, for whoever looks at it. */
function FormFields({ f, preview }: { f: DailyForm; preview?: boolean }) {
  const t = useTranslations("reports.daily");
  const v = f.saved?.values ?? {};
  return (
    <>
      {f.items.length > 0 && <div className="wide"><Table head={[t("item"), t("today"), ""]} rows={f.items.map((it) => [
        <span key="t"><b>{serverText(it.title)}</b><small className="sub">{serverText(it.target)}</small></span>,
        it.auto ? <b key="v">{it.value ?? "—"}</b> : <input key="v" type="number" min="0" step="any" name={`v:${it.key}`} defaultValue={v[it.key] ?? ""} disabled={preview} style={{ width: 90 }} aria-label={serverText(it.title)} />,
        <span key="h" className="hint">{it.auto ? t("fromSystem") : t("typeIt")}</span>,
      ])} /></div>}
      {f.fields.map((x) => <Field key={x.id} label={serverText(x.label)} wide>
        <input name={`f:${x.id}`} type={x.type === "number" ? "number" : "text"} min={0} step="any" defaultValue={v[x.id] ?? ""} disabled={preview} />
      </Field>)}
      <Field label={t("whatElse")} wide><textarea name="note" defaultValue={f.saved?.note ?? ""} disabled={preview} /></Field>
    </>
  );
}

function DailyModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("reports.daily");
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
    if (!r.onTime) alert(t("lateAlert"));
  }, t("handedIn"));
  return (
    <Modal title={t("title")} onClose={onClose}>
      {!q.data ? <Empty text={t("loading")} /> : (
        <form className="grid" onSubmit={onFormSubmit(send)}>
          <FormFields f={q.data} />
          <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button><button className="btn"><Icon name="send" />{t("submit")}</button></div>
        </form>
      )}
    </Modal>
  );
}

/** The home's «سلّم» tasks: the hand-ins due today (demo «reportInbox»). */
export function MyHandIns() {
  const t = useTranslations("reports.handIns");
  const td = useTranslations("reports.daily");
  const q = useQuery({ queryKey: ["reports", "mine"], queryFn: () => api.get<MyHandIn[]>("/reports/mine") });
  const run = useAction(), qc = useQueryClient();
  const [daily, setDaily] = useState(false);
  if (!q.data?.length) return null;
  const hand = (h: MyHandIn) => void run(async () => {
    const r = await api.post<{ onTime: boolean; counted: boolean }>(`/reports/scheduled/${h.reportId}/hand-in`);
    await qc.invalidateQueries({ queryKey: ["reports"] });
    if (!r.onTime) alert(td("lateAlert"));
  }, h.kpi ? t("handedKpi") : t("handed"));
  return (
    <Card title={t("title")} icon="upload" extra={<Chip tone="warn">{q.data.length}</Chip>}>
      {q.data.map((h) => (
        <div key={h.reportId} className="line-item">
          <span><b>{t("handIn", { name: serverText(h.name) })}</b><small className="hint">{h.late ? t("late") : ""}{t("due", { time: hm(h.due) })}{h.kpi ? t("countsKpi") : h.daily ? t("whatYouDid") : ""}</small></span>
          {h.daily ? <button className="btn sm" onClick={() => setDaily(true)}>{t("write")}</button> : <button className="btn sm" onClick={() => hand(h)}><Icon name="check" />{t("done")}</button>}
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
  const t = useTranslations("reports.board");
  const td = useTranslations("reports.daily");
  const { me } = useMe();
  const [pick, setPick] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [view, setView] = useState<"day" | "shape">("day");
  const first = useDay(me?.id ?? null, "");
  const id = pick ?? first.data?.team[0]?.userId ?? me?.id ?? null;
  const q = useDay(id, day);
  const d = q.data ?? (id === me?.id ? first.data : undefined);
  if (!d) return <Card><Empty text={q.isError ? t("none") : td("loading")} icon="list" /></Card>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }), shown = d.form.day, dayLbl = shown === today ? td("today") : new Date(shown).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  return (
    <Card title={t("title")} icon="list" extra={<Chip tone="info">{t("handedAt", { time: d.time })}</Chip>} sub={t("sub", { to: serverText(d.to) })}>
      <div className="row">
        <select value={id ?? ""} onChange={(e) => setPick(e.target.value)} aria-label={t("employee")}>
          {(d.team.some((x) => x.userId === d.person.userId) ? d.team : [{ userId: d.person.userId, name: d.person.name, handed: false }, ...d.team]).map((x) => <option key={x.userId} value={x.userId}>{x.name}{x.handed ? t("handed") : ""}</option>)}
        </select>
        <div className="seg" role="group" aria-label={t("view")}>
          <button aria-pressed={view === "day"} onClick={() => setView("day")}>{t("dayReport")}</button>
          <button aria-pressed={view === "shape"} onClick={() => setView("shape")}>{t("shape")}</button>
        </div>
        {view === "day" && <>
          <label className="date-f"><span>{t("day")}</span><input type="date" value={day || shown} max={today} onChange={(e) => setDay(e.target.value)} aria-label={t("theDay")} /></label>
          <span className="hint">{t("handedCount", { day: dayLbl, got: String(d.team.filter((x) => x.handed).length), of: String(d.team.length) })}</span>
        </>}
      </div>
      {view === "shape" ? <Shape d={d} /> : (
        <>
          <section className="card flat">
            <div className="card-head"><h3><span className="ico"><Icon name="file" /></span><span>{t("reportOf", { name: d.person.name, day: dayLbl })}</span></h3><Chip tone={STATUS_TONE[d.form.status]}>{t(`status.${d.form.status}`)}{d.form.saved ? ` · ${hm(d.form.saved.at)}` : ""}</Chip></div>
            {d.form.saved && d.form.fields.filter((f) => d.form.saved!.values[f.id] != null).map((f) => <p key={f.id}><b>{serverText(f.label)}:</b> {d.form.saved!.values[f.id]}</p>)}
            {d.form.saved?.note && <div className="quote">{d.form.saved.note}</div>}
          </section>
          <Table head={[td("item"), dayLbl, t("last7"), t("month"), t("quarter"), t("target"), t("achievement")]} empty={t("noCard")}
            rows={d.rows.map((r) => [<span key="t"><b>{serverText(r.title)}</b><small className="sub">{serverText(r.calc)}</small></span>,
              <b key="d">{r.day ?? "—"}</b>, ...(r.week == null ? ["—", "—", "—"] : [r.week, r.month, r.quarter]), serverText(r.target), <b key="a">{Math.round(r.achievement)}%</b>])} />
        </>
      )}
    </Card>
  );
}

function Shape({ d }: { d: DayReport }) {
  const t = useTranslations("reports.shape");
  const run = useAction(), qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports", "day"] });
  const add = (f: FormData) => void run(async () => { await api.post("/reports/daily/fields", { userId: d.person.userId, label: String(f.get("label")), type: String(f.get("type")) }); await refresh(); }, t("added"));
  const del = (id: string) => void run(async () => { await api.del(`/reports/daily/fields/${id}`); await refresh(); }, t("removed"));
  const copy = () => { if (confirm(t("confirmCopy"))) void run(async () => { const r = await api.post<{ copied: number }>(`/reports/daily/fields/copy/${d.person.userId}`); await refresh(); alert(t("copied", { count: r.copied, n: String(r.copied) })); }); };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="file" /></span><span>{t("title", { name: d.person.name })}<small>{t("sub", { time: d.time, to: serverText(d.to), late: serverText(d.late) })}</small></span></h3></div>
      <Table head={[t("field"), t("how"), t("goes"), ""]} rows={d.shape.map((x) => [<b key="l">{serverText(x.label)}</b>, serverText(x.how), <span key="g" className="hint">{serverText(x.goes)}</span>,
        x.fieldId && d.can.fields ? <button key="x" className="btn ghost sm" onClick={() => del(x.fieldId!)} aria-label={t("remove", { name: serverText(x.label) })}><Icon name="x" /></button> : ""])} />
      {d.can.fields && <>
        <form className="row" onSubmit={onFormSubmit(add)}>
          <input name="label" placeholder={t("newPh")} required aria-label={t("newLabel")} />
          <select name="type" aria-label={t("type")}><option value="number">{t("number")}</option><option value="text">{t("text")}</option></select>
          <button className="btn ghost"><Icon name="plus" />{t("add")}</button>
          {d.form.fields.length > 0 && <button type="button" className="btn ghost sm" onClick={copy}>{t("copy")}</button>}
        </form>
        <p className="hint">{t("hint")}</p>
      </>}
      <h4 className="mini-h">{t("preview")}</h4>
      <div className="grid report-preview"><FormFields f={d.form} preview /></div>
    </section>
  );
}
