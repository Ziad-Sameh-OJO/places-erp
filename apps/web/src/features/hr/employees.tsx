"use client";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeeFile, EmployeesView } from "@places/contracts";
import { DEFAULT_TIERS } from "@places/domain";
import { Chip, Empty, Field, Icon, Note, Table, Tabs, onFormSubmit, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money, short } from "@/lib/format";

/** M-05 · الموظفين (7.1, demo hr.js emps()): the list in scope, search and department filter; a row opens the file. */
export function Employees() {
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(dep ? { department: dep } : {}) }).toString();
  const list = useQuery({ queryKey: ["hr", "employees", qs], queryFn: () => api.get<EmployeesView>(`/hr/employees?${qs}`), placeholderData: keepPreviousData });
  const d = list.data;
  return (
    <>
      <div className="toolbar row">
        <label className="search"><Icon name="search" /><input type="search" placeholder="اسم أو قسم" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label="القسم"><option value="">كل الأقسام</option>{d?.departments.map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      {!d ? <Empty text="بيحمّل…" icon="clock" /> : (
        <Table head={["الموظف", "القسم", "الدوام", "المرتب", "التارجت", "العمولة", "رصيد الإجازات", "شرايح الخصم"]} empty="مفيش موظفين" onRow={(i) => setOpen(d.items[i]!.id)}
          rows={d.items.map((e) => [
            <span key="n"><b>{e.name}</b><span className="sub">{e.jobTitle}</span></span>, e.department,
            e.partTime ? <Chip key="p" tone="info">Part-time</Chip> : "Full-time",
            Number(e.salary) ? money(e.salary) : <Chip key="s" tone="warn">مالوش مرتب</Chip>, Number(e.target) ? short(e.target) : "—",
            Number(e.commissionPct) ? `${Number(e.commissionPct)}%` : "—", e.leaveBalance, e.customTiers ? <Chip key="t" tone="acc">خاصة</Chip> : "الافتراضي",
          ])} />
      )}
      {open && <EmployeeDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The employee file (demo empDrawer): «الفايل» and «البيانات» (HR edits; the Super Admin only reads — Q49). */
function EmployeeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const [tab, setTab] = useState<"file" | "edit">("file");
  const q = useQuery({ queryKey: ["hr", "employee", id], queryFn: () => api.get<EmployeeFile>(`/hr/employees/${id}`) });
  const e = q.data;
  const [custom, setCustom] = useState<boolean | null>(null);
  const [partTime, setPartTime] = useState<boolean | null>(null);
  if (!e) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  const tiersOn = custom ?? e.deductionTiers != null, pt = partTime ?? e.partTime, t = e.deductionTiers ?? DEFAULT_TIERS;
  const save = onFormSubmit(async (d) => run(async () => {
    const n = (k: string) => Number(d.get(k));
    await api.patch(`/hr/employees/${id}`, {
      salary: String(d.get("salary") || "0"), target: String(d.get("target") || "0"), commissionPct: n("commissionPct"), partTime: pt,
      partTimeDeductions: d.get("ptDeduct") === "yes", leaveBalance: n("leaveBalance"), joinedAt: String(d.get("joinedAt") || "") || null,
      deductionTiers: tiersOn ? { quarterFrom: n("quarterFrom"), halfFrom: n("halfFrom"), dayFrom: n("dayFrom") } : null,
      fixedSchedule: String(d.get("fixedSchedule") || "").trim() || null,
    });
    await qc.invalidateQueries({ queryKey: ["hr"] });
    setTab("file");
  }, "اتحفظ · اتحدّث في المالية"));
  const kv: [string, string][] = [
    ["القسم", e.department], ["الوظيفة", e.jobTitle], ["الدوام", e.partTime ? `Part-time · ${e.partTimeDeductions ? "عليه خصومات" : "من غير خصومات"}` : "Full-time"],
    ["المرتب", money(e.salary)], ["التارجت", Number(e.target) ? money(e.target) : "—"], ["نسبة العمولة", Number(e.commissionPct) ? `${Number(e.commissionPct)}%` : "—"],
    ["بيتابعه", e.manager?.name ?? "—"], ["الفريق", e.team ?? "—"], ["بدأ", e.joinedAt ?? "—"], ["رصيد الإجازات السنوي", String(e.leaveBalance)],
    ["شرايح الخصم", e.deductionTiers ? `خاصة: ربع من ${e.deductionTiers.quarterFrom} د · نص من ${e.deductionTiers.halfFrom} د · يوم من ${e.deductionTiers.dayFrom} د` : "الافتراضي"],
    ["مواعيد خاصة", e.fixedSchedule ?? "—"],
  ];
  return (
    <Drawer title={e.name} sub={`${e.department} · فايل الموظف`} onClose={onClose} chips={e.partTime ? <Chip tone="info">Part-time</Chip> : <Chip plain>Full-time</Chip>}>
      <Tabs items={[["file", "الفايل"], ...(can("hr", "edit") ? [["edit", "البيانات"] as ["edit", string]] : [])]} value={tab} onChange={setTab} />
      {tab === "file" ? (
        <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      ) : (
        <form className="grid" onSubmit={save}>
          <Field label="المرتب" req><input name="salary" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={Number(e.salary) ? e.salary : ""} required /></Field>
          <Field label="التارجت"><input name="target" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={Number(e.target) ? e.target : ""} /></Field>
          <Field label="الـ Scheme % (من نصيبه في الكوميشن)"><input name="commissionPct" type="number" min={0} max={100} step="0.1" defaultValue={Number(e.commissionPct)} /></Field>
          <Field label="الدوام"><select value={pt ? "pt" : "ft"} onChange={(x) => setPartTime(x.target.value === "pt")}><option value="ft">Full-time</option><option value="pt">Part-time (من غير بصمة)</option></select></Field>
          {pt && <Field label="خصومات الـ Part-time"><select name="ptDeduct" defaultValue={e.partTimeDeductions ? "yes" : "no"}><option value="no">من غير خصومات</option><option value="yes">عليه خصومات بالشرايح</option></select></Field>}
          <Field label="رصيد الإجازات السنوي"><input name="leaveBalance" type="number" min={0} max={60} defaultValue={e.leaveBalance} /></Field>
          <Field label="بدأ الشغل"><input name="joinedAt" type="date" defaultValue={e.joinedAt ?? ""} /></Field>
          <Field label="شرايح الخصم"><select value={tiersOn ? "custom" : "default"} onChange={(x) => setCustom(x.target.value === "custom")}><option value="default">الافتراضي (ربع 11:17 · نص 11:30 · يوم 12:00)</option><option value="custom">خاصة بالموظف ده</option></select></Field>
          {tiersOn && <>
            <Field label="ربع يوم من الدقيقة"><input name="quarterFrom" type="number" min={17} defaultValue={t.quarterFrom} required /></Field>
            <Field label="نص يوم من الدقيقة"><input name="halfFrom" type="number" min={18} defaultValue={t.halfFrom} required /></Field>
            <Field label="يوم من الدقيقة"><input name="dayFrom" type="number" min={19} defaultValue={t.dayFrom} required /></Field>
          </>}
          <Field label="مواعيد حضور خاصة" wide><input name="fixedSchedule" defaultValue={e.fixedSchedule ?? ""} placeholder="مثلاً: الاتنين والخميس 17:00–19:00" /></Field>
          <Note>الدقايق بعد 11:00 (أول 16 دقيقة من غير تأخير). التعديلات بتسمع أوتوماتيك في المالية والمبيعات، وبتتسجّل في الـ Audit Log.</Note>
          <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setTab("file")}>إلغاء</button><button className="btn">حفظ</button></div>
        </form>
      )}
    </Drawer>
  );
}
