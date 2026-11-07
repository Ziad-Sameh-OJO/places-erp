"use client";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceDayView, AttendanceHistoryView, EmployeesView, FingerprintRow, WeeklyDelayView } from "@places/contracts";
import { Card, Chip, Empty, ExportButton, Field, Icon, ImportDialog, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { dateLocale, money } from "@/lib/format";
import { serverText } from "@/lib/server-text";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
const tone = (deduction: number, late: number) => (deduction >= 1 ? "bad" : deduction > 0 ? "warn" : late > 0 ? "info" : "ok");
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
const useEmployees = () => useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => api.get<EmployeesView>("/hr/employees") });

/** M-05 · «حضور النهارده» (7.2 · 7.12, demo hr.js att()): the day's fingerprints through the tiers, who didn't check in, the sheet upload and the names to link. */
export function AttendanceToday() {
  const t = useTranslations("hr");
  const { can } = useMe();
  const [day, setDay] = useState(today());
  const [q, setQ] = useState("");
  const [upload, setUpload] = useState(false);
  const [entry, setEntry] = useState<{ employeeId: string; name: string; checkIn?: string } | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  const v = useQuery({ queryKey: ["hr", "attendance", day], queryFn: () => api.get<AttendanceDayView>(`/hr/attendance/day?day=${day}`), placeholderData: keepPreviousData });
  const emps = useEmployees();
  const d = v.data;
  const link = (id: string, employeeId: string, name: string) => run(async () => { await api.post(`/hr/attendance/unmatched/${id}/link`, { employeeId }); await refresh(); }, t("attendance.linked", { name }));
  const rows = d?.rows.filter((r) => !q || r.name.includes(q)) ?? [];
  return (
    <>
      {d && d.unmatched.length > 0 && can("hr", "edit") && (
        <Card title={t("attendance.unmatchedTitle")} icon="alert" className="attn" extra={<Chip tone="warn">{d.unmatched.length}</Chip>} sub={t("attendance.unmatchedSub")}>
          {d.unmatched.map((u) => (
            <div key={u.id} className="line-item"><span><b>{u.name}</b> · {u.day} · {u.checkIn ?? "—"}</span>
              <select defaultValue="" aria-label={t("attendance.linkAria")} onChange={(e) => { const emp = emps.data?.items.find((x) => x.id === e.target.value); if (emp) void link(u.id, emp.id, emp.name); }}>
                <option value="" disabled>{t("attendance.linkTo")}</option>{emps.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
          ))}
        </Card>
      )}
      <Note>{t("attendance.sourcesNote")}</Note>
      {d && <div className="kpis">
        <KpiTile label={t("attendance.present")} value={d.totals.present} sub={d.working ? t("attendance.presentOf", { total: d.totals.present + d.missing.length }) : d.holiday ? serverText(d.holiday) : t("attendance.dayOff")} icon="fingerprint" tone="ok" />
        <KpiTile label={t("attendance.late")} value={d.totals.late} sub={t("attendance.lateSub")} icon="clock" tone="warn" />
        <KpiTile label={t("attendance.missing")} value={d.missing.length} sub={d.working ? t("attendance.workDay") : t("attendance.notWorkDay")} icon="alert" {...(d.missing.length ? { tone: "bad" as const } : {})} />
        <KpiTile label={t("attendance.dayDeductions")} value={money(d.totals.deductions)} sub={t("attendance.dayDeductionsSub")} icon="wallet" />
      </div>}
      <div className="toolbar">
        <ExportButton module="hr" path="/hr/attendance/export" query={new URLSearchParams(q ? { day, q } : { day })} filename={t("attendance.exportFile", { day })} label={t("attendance.export")} />
        <button className="btn ghost sm" onClick={() => setDay(shift(day, -1))} aria-label={t("attendance.prevDay")}>‹</button>
        <label className="date-f"><span>{t("common.day")}</span><input type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        <button className="btn ghost sm" onClick={() => setDay(shift(day, 1))} disabled={day >= today()} aria-label={t("attendance.nextDay")}>›</button>
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("attendance.searchName")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <span className="spacer" />
        {can("hr", "import") && <button className="btn" onClick={() => setUpload(true)}><Icon name="upload" />{t("attendance.uploadSheet")}</button>}
      </div>
      {!d ? <Empty text={t("common.loading")} icon="clock" /> : <>
        {d.holiday && <Note kind="ok">{t("attendance.holidayNote", { day: dayName(d.day), holiday: serverText(d.holiday) })}</Note>}
        <Table head={[t("common.employee"), "Check-in", "Check-out", t("common.lateMinutes"), t("common.status"), t("common.deduction"), ""]} empty={t("attendance.emptyDay")}
          rows={rows.map((r) => [
            <span key="n"><b>{r.name}</b><span className="sub">{serverText(r.department)}{r.fixedSchedule ? ` · ${t("attendance.specialSchedule", { schedule: r.fixedSchedule })}` : ""}{r.customTiers ? ` · ${t("attendance.customTiers")}` : ""}</span></span>,
            // 7.3: HR sees the Visit that started the day and the real fingerprint, both
            r.visitAt ? <span key="i">Visit {r.visitAt}{r.checkIn && <span className="sub">{t("attendance.fingerprinted", { time: r.checkIn })}</span>}</span> : r.checkIn ?? "—",
            r.checkOut ?? "—", r.lateMinutes ? t("common.minutes", { n: r.lateMinutes }) : "—",
            <Chip key="s" tone={tone(r.deduction, r.lateMinutes)}>{serverText(r.label)}</Chip>,
            r.deduction ? <span key="d">{r.deduction === 1 ? t("common.fullDay") : r.deduction === 0.5 ? t("common.halfDay") : t("common.quarterDay")}<span className="sub">{money(r.deductionAmount)}</span></span> : r.confirmForgot ? t("attendance.awaitingConfirm") : "—",
            <span key="e" className="row">
              {r.confirmForgot && can("hr", "approve") && <button className="btn sm" onClick={() => void run(async () => { await api.post(`/hr/attendance/${r.id}/confirm-forgot`, {}); await refresh(); }, t("attendance.confirmedOk"))}>{t("attendance.confirmBtn")}</button>}
              {can("hr", "edit") && <button className="btn ghost sm" onClick={() => setEntry({ employeeId: r.employeeId, name: r.name, ...(r.checkIn ? { checkIn: r.checkIn } : {}) })}>{t("common.edit")}</button>}
            </span>,
          ])} />
        {d.missing.length > 0 && (
          <Card title={t("attendance.missing")} icon="alert" sub={t("attendance.missingSub")}>
            {d.missing.map((m) => <div key={m.employeeId} className="line-item"><span><b>{m.name}</b> · {serverText(m.department)}</span>
              {can("hr", "edit") && <button className="btn ghost sm" onClick={() => setEntry({ employeeId: m.employeeId, name: m.name })}>{t("attendance.recordDay")}</button>}</div>)}
          </Card>
        )}
      </>}
      <Note>{t("attendance.tiersNote")}</Note>
      {upload && <ImportDialog<FingerprintRow> title={t("attendance.uploadSheet")} path="/hr/attendance/import" template={t("attendance.template")}
        columns={[["name", t("attendance.colName")], ["day", t("attendance.colDate")], ["checkIn", t("attendance.colIn")], ["checkOut", t("attendance.colOut")]]} onDone={() => { setUpload(false); void refresh(); }} onClose={() => setUpload(false)} />}
      {entry && (
        <Modal title={`${entry.name} · ${day}`} onClose={() => setEntry(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => {
            await api.put("/hr/attendance", { employeeId: entry.employeeId, day, checkIn: f.get("checkIn"), ...(f.get("checkOut") ? { checkOut: f.get("checkOut") } : {}) });
            await refresh(); setEntry(null);
          }, t("common.recorded")))}>
            <Field label="Check-in" req><input name="checkIn" type="time" defaultValue={entry.checkIn ?? ""} required /></Field>
            <Field label="Check-out"><input name="checkOut" type="time" /></Field>
            <Note>{t("attendance.entryNote")}</Note>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setEntry(null)}>{t("common.cancel")}</button><button className="btn">{t("common.save")}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** «التاريخ» (7.10, demo history()): one person over a period, day by day, with the totals. */
export function AttendanceHistory() {
  const t = useTranslations("hr");
  const emps = useEmployees();
  const [emp, setEmp] = useState("");
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const qs = new URLSearchParams({ from, to, ...(emp ? { employeeId: emp } : {}) }).toString();
  const h = useQuery({ queryKey: ["hr", "history", qs], queryFn: () => api.get<AttendanceHistoryView>(`/hr/attendance/history?${qs}`), enabled: !!emp, placeholderData: keepPreviousData });
  return (
    <>
      <div className="toolbar">
        <select value={emp} onChange={(e) => setEmp(e.target.value)} aria-label={t("common.employee")}><option value="">{t("common.pickEmployee")}</option>{emps.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <label className="date-f"><span>{t("common.from")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="date-f"><span>{t("common.to")}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!emp ? <Empty text={t("history.pick")} icon="fingerprint" /> : !h.data ? <Empty text={t("common.loading")} icon="clock" /> : <>
        <div className="kpis sm">
          <KpiTile label={t("common.lateMinutes")} value={t("common.minutes", { n: h.data.totals.late })} icon="clock" tone="warn" />
          <KpiTile label={t("common.deductionDays")} value={h.data.totals.deductionDays} icon="alert" tone="bad" />
          <KpiTile label={t("common.deductionAmount")} value={money(h.data.totals.deductions)} icon="wallet" />
        </div>
        <Table head={[t("common.day"), "Check-in", "Check-out", t("common.lateMinutes"), t("common.status"), t("common.deduction")]} empty={t("history.empty")}
          rows={h.data.rows.map((r) => [dayName(r.day), r.checkIn ?? "—", r.checkOut ?? "—", r.lateMinutes ? t("common.minutes", { n: r.lateMinutes }) : "—", <Chip key="s" tone={tone(r.deduction, r.lateMinutes)}>{serverText(r.label)}</Chip>, r.deduction ? money(r.deductionAmount) : "—"])} />
      </>}
    </>
  );
}

/** «Weekly Delay» (7.10, demo delay()): every minute after 11:16 per person per day, the period and the most late first. */
export function WeeklyDelay() {
  const t = useTranslations("hr");
  const [preset, setPreset] = useState<"week" | "2w" | "custom">("week");
  const [cf, setCf] = useState(shift(today(), -13));
  const [ct, setCt] = useState(today());
  const from = preset === "week" ? shift(today(), -6) : preset === "2w" ? shift(today(), -13) : cf, to = preset === "custom" ? ct : today();
  const v = useQuery({ queryKey: ["hr", "delay", from, to], queryFn: () => api.get<WeeklyDelayView>(`/hr/attendance/weekly-delay?from=${from}&to=${to}`), placeholderData: keepPreviousData });
  const d = v.data, max = Math.max(1, ...(d?.people.map((p) => p.total) ?? [1]));
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group">{([["week", t("delay.thisWeek")], ["2w", t("delay.twoWeeks")], ["custom", t("delay.custom")]] as const).map(([k, l]) => <button key={k} aria-pressed={preset === k} onClick={() => setPreset(k)}>{l}</button>)}</div>
        {preset === "custom" && <><label className="date-f"><span>{t("common.from")}</span><input type="date" value={cf} onChange={(e) => setCf(e.target.value)} /></label><label className="date-f"><span>{t("common.to")}</span><input type="date" value={ct} onChange={(e) => setCt(e.target.value)} /></label></>}
      </div>
      {!d ? <Empty text={t("common.loading")} icon="clock" /> : (
        <div className="tbl-wrap"><table className="heat"><thead><tr><th>{t("common.employee")}</th>{d.days.map((x) => <th key={x} className="n">{dayName(x)}</th>)}<th>{t("delay.period")}</th></tr></thead>
          <tbody>{d.people.map((p) => (
            <tr key={p.employeeId}><td>{p.name}</td>
              {d.days.map((x) => { const c = p.byDay[x]; return <td key={x} className={`n hc ${!c ? "" : c.late > 30 ? "h3" : c.late > 10 ? "h2" : c.late > 0 ? "h1" : "h0"}`} title={c ? serverText(c.label) : undefined}>{c ? c.late : "·"}</td>; })}
              <td><div className="cell-bar"><b className="num">{t("common.minutes", { n: p.total })}</b><div className={`bar ${p.total > 60 ? "bad" : p.total > 20 ? "warn" : ""}`}><i style={{ width: `${(p.total / max) * 100}%` }} /></div></div></td></tr>
          ))}</tbody></table></div>
      )}
      <Note>{t("delay.note")}</Note>
    </>
  );
}
