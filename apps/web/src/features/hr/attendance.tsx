"use client";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceDayView, AttendanceHistoryView, EmployeesView, FingerprintRow, WeeklyDelayView } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, ImportDialog, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
const tone = (deduction: number, late: number) => (deduction >= 1 ? "bad" : deduction > 0 ? "warn" : late > 0 ? "info" : "ok");
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };
const useEmployees = () => useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => api.get<EmployeesView>("/hr/employees") });

/** M-05 · «حضور النهارده» (7.2 · 7.12, demo hr.js att()): the day's fingerprints through the tiers, who didn't check in, the sheet upload and the names to link. */
export function AttendanceToday() {
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
  const link = (id: string, employeeId: string, name: string) => run(async () => { await api.post(`/hr/attendance/unmatched/${id}/link`, { employeeId }); await refresh(); }, `اتربط بـ ${name} واتحسب`);
  const rows = d?.rows.filter((r) => !q || r.name.includes(q)) ?? [];
  return (
    <>
      {d && d.unmatched.length > 0 && can("hr", "edit") && (
        <Card title="أسامي في شيت البصمة مش متطابقة" icon="alert" className="attn" extra={<Chip tone="warn">{d.unmatched.length}</Chip>} sub="اربط كل اسم بالموظف الصح عشان يتحسب · الشيت الجاي هيتعرّف عليه لوحده">
          {d.unmatched.map((u) => (
            <div key={u.id} className="line-item"><span><b>{u.name}</b> · {u.day} · {u.checkIn ?? "—"}</span>
              <select defaultValue="" aria-label="اربط بموظف" onChange={(e) => { const emp = emps.data?.items.find((x) => x.id === e.target.value); if (emp) void link(u.id, emp.id, emp.name); }}>
                <option value="" disabled>اربط بـ…</option>{emps.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
          ))}
        </Card>
      )}
      <Note>البصمة بتوصل بطريقتين: الجهاز مربوط بالسيستم وبيتسحب لوحده، أو الـ HR ترفع شيت البصمة (Excel / CSV) اللي بيطلع من الجهاز. إعادة رفع نفس الشيت مابتكررش أي يوم.</Note>
      {d && <div className="kpis">
        <KpiTile label="حضروا" value={d.totals.present} sub={d.working ? `من ${d.totals.present + d.missing.length}` : d.holiday ?? "إجازة"} icon="fingerprint" tone="ok" />
        <KpiTile label="متأخرين" value={d.totals.late} sub="بعد 11:16" icon="clock" tone="warn" />
        <KpiTile label="مبصموش" value={d.missing.length} sub={d.working ? "يوم شغل" : "مش يوم شغل · مفيش غياب"} icon="alert" {...(d.missing.length ? { tone: "bad" as const } : {})} />
        <KpiTile label="خصومات اليوم" value={money(d.totals.deductions)} sub="المرتب ÷ 26 × الخصم" icon="wallet" />
      </div>}
      <div className="toolbar">
        <button className="btn ghost sm" onClick={() => setDay(shift(day, -1))} aria-label="اليوم اللي قبله">‹</button>
        <label className="date-f"><span>اليوم</span><input type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        <button className="btn ghost sm" onClick={() => setDay(shift(day, 1))} disabled={day >= today()} aria-label="اليوم اللي بعده">›</button>
        <label className="search"><Icon name="search" /><input type="search" placeholder="اسم الموظف" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <span className="spacer" />
        {can("hr", "import") && <button className="btn" onClick={() => setUpload(true)}><Icon name="upload" />رفع شيت البصمة</button>}
      </div>
      {!d ? <Empty text="بيحمّل…" icon="clock" /> : <>
        {d.holiday && <Note kind="ok">{dayName(d.day)} إجازة رسمية: {d.holiday} · مفيش غياب اليوم ده.</Note>}
        <Table head={["الموظف", "Check-in", "Check-out", "دقايق التأخير", "الحالة", "الخصم", ""]} empty="مفيش بصمات اليوم ده"
          rows={rows.map((r) => [
            <span key="n"><b>{r.name}</b><span className="sub">{r.department}{r.fixedSchedule ? ` · مواعيد خاصة: ${r.fixedSchedule}` : ""}{r.customTiers ? " · شرايح خاصة" : ""}</span></span>,
            r.checkIn ?? "—", r.checkOut ?? "—", r.lateMinutes ? `${r.lateMinutes} د` : "—",
            <Chip key="s" tone={tone(r.deduction, r.lateMinutes)}>{r.label}</Chip>,
            r.deduction ? <span key="d">{r.deduction === 1 ? "يوم" : r.deduction === 0.5 ? "نص يوم" : "ربع يوم"}<span className="sub">{money(r.deductionAmount)}</span></span> : "—",
            can("hr", "edit") ? <button key="e" className="btn ghost sm" onClick={() => setEntry({ employeeId: r.employeeId, name: r.name, ...(r.checkIn ? { checkIn: r.checkIn } : {}) })}>عدّل</button> : "",
          ])} />
        {d.missing.length > 0 && (
          <Card title="مبصموش" icon="alert" sub="لو الجهاز كان واقف، الـ HR تكمّل اليوم بإيدها">
            {d.missing.map((m) => <div key={m.employeeId} className="line-item"><span><b>{m.name}</b> · {m.department}</span>
              {can("hr", "edit") && <button className="btn ghost sm" onClick={() => setEntry({ employeeId: m.employeeId, name: m.name })}>سجّل اليوم</button>}</div>)}
          </Card>
        )}
      </>}
      <Note>لحد 11:16 في الميعاد · 11:17 لـ 11:29 ربع يوم · 11:30 لـ 11:59 نص يوم · 12:00 وبعدها يوم. اللي ليه شرايح خاصة بيتحسب بشرايحه، والـ Part-time حسب ما الـ HR حددت.</Note>
      {upload && <ImportDialog<FingerprintRow> title="رفع شيت البصمة" path="/hr/attendance/import" template="قالب شيت البصمة.xlsx"
        columns={[["name", "الاسم"], ["day", "التاريخ"], ["checkIn", "الدخول"], ["checkOut", "الخروج"]]} onDone={() => { setUpload(false); void refresh(); }} onClose={() => setUpload(false)} />}
      {entry && (
        <Modal title={`${entry.name} · ${day}`} onClose={() => setEntry(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => {
            await api.put("/hr/attendance", { employeeId: entry.employeeId, day, checkIn: f.get("checkIn"), ...(f.get("checkOut") ? { checkOut: f.get("checkOut") } : {}) });
            await refresh(); setEntry(null);
          }, "اتسجّل"))}>
            <Field label="Check-in" req><input name="checkIn" type="time" defaultValue={entry.checkIn ?? ""} required /></Field>
            <Field label="Check-out"><input name="checkOut" type="time" /></Field>
            <Note>بيتحسب بالشرايح على طول، وبيتسجّل في الـ Audit Log.</Note>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setEntry(null)}>إلغاء</button><button className="btn">حفظ</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** «التاريخ» (7.10, demo history()): one person over a period, day by day, with the totals. */
export function AttendanceHistory() {
  const emps = useEmployees();
  const [emp, setEmp] = useState("");
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const qs = new URLSearchParams({ from, to, ...(emp ? { employeeId: emp } : {}) }).toString();
  const h = useQuery({ queryKey: ["hr", "history", qs], queryFn: () => api.get<AttendanceHistoryView>(`/hr/attendance/history?${qs}`), enabled: !!emp, placeholderData: keepPreviousData });
  return (
    <>
      <div className="toolbar">
        <select value={emp} onChange={(e) => setEmp(e.target.value)} aria-label="الموظف"><option value="">اختار موظف</option>{emps.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <label className="date-f"><span>من</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="date-f"><span>لحد</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!emp ? <Empty text="اختار موظف تشوف حضوره" icon="fingerprint" /> : !h.data ? <Empty text="بيحمّل…" icon="clock" /> : <>
        <div className="kpis sm">
          <KpiTile label="دقايق التأخير" value={`${h.data.totals.late} د`} icon="clock" tone="warn" />
          <KpiTile label="أيام الخصم" value={h.data.totals.deductionDays} icon="alert" tone="bad" />
          <KpiTile label="مبلغ الخصم" value={money(h.data.totals.deductions)} icon="wallet" />
        </div>
        <Table head={["اليوم", "Check-in", "Check-out", "دقايق التأخير", "الحالة", "الخصم"]} empty="مفيش بصمات في الفترة دي"
          rows={h.data.rows.map((r) => [dayName(r.day), r.checkIn ?? "—", r.checkOut ?? "—", r.lateMinutes ? `${r.lateMinutes} د` : "—", <Chip key="s" tone={tone(r.deduction, r.lateMinutes)}>{r.label}</Chip>, r.deduction ? money(r.deductionAmount) : "—"])} />
      </>}
    </>
  );
}

/** «Weekly Delay» (7.10, demo delay()): every minute after 11:16 per person per day, the period and the most late first. */
export function WeeklyDelay() {
  const [preset, setPreset] = useState<"week" | "2w" | "custom">("week");
  const [cf, setCf] = useState(shift(today(), -13));
  const [ct, setCt] = useState(today());
  const from = preset === "week" ? shift(today(), -6) : preset === "2w" ? shift(today(), -13) : cf, to = preset === "custom" ? ct : today();
  const v = useQuery({ queryKey: ["hr", "delay", from, to], queryFn: () => api.get<WeeklyDelayView>(`/hr/attendance/weekly-delay?from=${from}&to=${to}`), placeholderData: keepPreviousData });
  const d = v.data, max = Math.max(1, ...(d?.people.map((p) => p.total) ?? [1]));
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group">{([["week", "الأسبوع ده"], ["2w", "آخر أسبوعين"], ["custom", "فترة مخصصة"]] as const).map(([k, l]) => <button key={k} aria-pressed={preset === k} onClick={() => setPreset(k)}>{l}</button>)}</div>
        {preset === "custom" && <><label className="date-f"><span>من</span><input type="date" value={cf} onChange={(e) => setCf(e.target.value)} /></label><label className="date-f"><span>لحد</span><input type="date" value={ct} onChange={(e) => setCt(e.target.value)} /></label></>}
      </div>
      {!d ? <Empty text="بيحمّل…" icon="clock" /> : (
        <div className="tbl-wrap"><table className="heat"><thead><tr><th>الموظف</th>{d.days.map((x) => <th key={x} className="n">{dayName(x)}</th>)}<th>الفترة</th></tr></thead>
          <tbody>{d.people.map((p) => (
            <tr key={p.employeeId}><td>{p.name}</td>
              {d.days.map((x) => { const c = p.byDay[x]; return <td key={x} className={`n hc ${!c ? "" : c.late > 30 ? "h3" : c.late > 10 ? "h2" : c.late > 0 ? "h1" : "h0"}`} title={c?.label}>{c ? c.late : "·"}</td>; })}
              <td><div className="cell-bar"><b className="num">{p.total} د</b><div className={`bar ${p.total > 60 ? "bad" : p.total > 20 ? "warn" : ""}`}><i style={{ width: `${(p.total / max) * 100}%` }} /></div></div></td></tr>
          ))}</tbody></table></div>
      )}
      <Note>دقايق التأخير = Check-in − 11:16 (مثلاً 11:18 = دقيقتين). بتتحسب كل الدقايق من غير استثناء، حتى للي ليهم شرايح خاصة.</Note>
    </>
  );
}
