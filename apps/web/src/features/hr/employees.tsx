"use client";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeeFile, EmployeesView } from "@places/contracts";
import { DEFAULT_TIERS } from "@places/domain";
import { Chip, Empty, Field, Icon, Note, Table, Tabs, onFormSubmit, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { money, short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { OneOnOneTab } from "./people-care";

/** M-05 · الموظفين (7.1, demo hr.js emps()): the list in scope, search and department filter; a row opens the file. */
export function Employees() {
  const t = useTranslations("hr");
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(dep ? { department: dep } : {}) }).toString();
  const list = useQuery({ queryKey: ["hr", "employees", qs], queryFn: () => api.get<EmployeesView>(`/hr/employees?${qs}`), placeholderData: keepPreviousData });
  const d = list.data;
  return (
    <>
      <div className="toolbar row">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("employees.search")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label={t("common.department")}><option value="">{t("employees.allDepartments")}</option>{d?.departments.map((x) => <option key={x} value={x}>{serverText(x)}</option>)}</select>
      </div>
      {!d ? <Empty text={t("common.loading")} icon="clock" /> : (
        <Table head={[t("common.employee"), t("common.department"), t("employees.schedule"), t("common.salary"), t("employees.target"), t("employees.commission"), t("employees.leaveBalance"), t("employees.tiers")]} empty={t("common.noEmployees")} onRow={(i) => setOpen(d.items[i]!.id)}
          rows={d.items.map((e) => [
            <span key="n"><b>{e.name}</b><span className="sub">{serverText(e.jobTitle)}</span></span>, serverText(e.department),
            e.partTime ? <Chip key="p" tone="info">Part-time</Chip> : "Full-time",
            Number(e.salary) ? money(e.salary) : <Chip key="s" tone="warn">{t("employees.noSalary")}</Chip>, Number(e.target) ? short(e.target) : "—",
            Number(e.commissionPct) ? `${Number(e.commissionPct)}%` : "—", e.leaveBalance, e.customTiers ? <Chip key="t" tone="acc">{t("employees.custom")}</Chip> : t("employees.default"),
          ])} />
      )}
      {open && <EmployeeDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The employee file (demo empDrawer): «الفايل» and «البيانات» (HR edits; the Super Admin only reads — Q49). */
function EmployeeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const tr = useTranslations("hr");
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const [tab, setTab] = useState<"file" | "one" | "edit">("file");
  const q = useQuery({ queryKey: ["hr", "employee", id], queryFn: () => api.get<EmployeeFile>(`/hr/employees/${id}`) });
  const e = q.data;
  const [custom, setCustom] = useState<boolean | null>(null);
  const [partTime, setPartTime] = useState<boolean | null>(null);
  if (!e) return <Drawer title="…" onClose={onClose}><p className="hint">{tr("common.loading")}</p></Drawer>;
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
  }, tr("employees.savedOk")));
  const kv: [string, string][] = [
    [tr("common.department"), serverText(e.department)], [tr("employees.jobTitle"), serverText(e.jobTitle)], [tr("employees.schedule"), e.partTime ? `Part-time · ${e.partTimeDeductions ? tr("employees.withDeductions") : tr("employees.noDeductions")}` : "Full-time"],
    [tr("common.salary"), money(e.salary)], [tr("employees.target"), Number(e.target) ? money(e.target) : "—"], [tr("employees.commissionPct"), Number(e.commissionPct) ? `${Number(e.commissionPct)}%` : "—"],
    [tr("employees.manager"), e.manager?.name ?? "—"], [tr("employees.team"), e.team ?? "—"], [tr("employees.joined"), e.joinedAt ?? "—"], [tr("employees.annualLeave"), String(e.leaveBalance)],
    [tr("employees.tiers"), e.deductionTiers ? tr("employees.customTiers", { quarter: e.deductionTiers.quarterFrom, half: e.deductionTiers.halfFrom, day: e.deductionTiers.dayFrom }) : tr("employees.default")],
    [tr("employees.specialSchedule"), e.fixedSchedule ?? "—"],
  ];
  return (
    <Drawer title={e.name} sub={`${serverText(e.department)} · ${tr("employees.file")}`} onClose={onClose} chips={e.partTime ? <Chip tone="info">Part-time</Chip> : <Chip plain>Full-time</Chip>}>
      <Tabs items={[["file", tr("employees.tabFile")], ["one", "1-to-1"], ...(can("hr", "edit") ? [["edit", tr("employees.tabData")] as ["edit", string]] : [])]} value={tab} onChange={setTab} />
      {tab === "file" ? (
        <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      ) : tab === "one" ? <OneOnOneTab employeeId={id} /> : (
        <form className="grid" onSubmit={save}>
          <Field label={tr("common.salary")} req><input name="salary" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={Number(e.salary) ? e.salary : ""} required /></Field>
          <Field label={tr("employees.target")}><input name="target" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={Number(e.target) ? e.target : ""} /></Field>
          <Field label={tr("employees.scheme")}><input name="commissionPct" type="number" min={0} max={100} step="0.1" defaultValue={Number(e.commissionPct)} /></Field>
          <Field label={tr("employees.schedule")}><select value={pt ? "pt" : "ft"} onChange={(x) => setPartTime(x.target.value === "pt")}><option value="ft">Full-time</option><option value="pt">{tr("employees.ptNoFingerprint")}</option></select></Field>
          {pt && <Field label={tr("employees.ptDeductions")}><select name="ptDeduct" defaultValue={e.partTimeDeductions ? "yes" : "no"}><option value="no">{tr("employees.noDeductions")}</option><option value="yes">{tr("employees.withTierDeductions")}</option></select></Field>}
          <Field label={tr("employees.annualLeave")}><input name="leaveBalance" type="number" min={0} max={60} defaultValue={e.leaveBalance} /></Field>
          <Field label={tr("employees.startedWork")}><input name="joinedAt" type="date" defaultValue={e.joinedAt ?? ""} /></Field>
          <Field label={tr("employees.tiers")}><select value={tiersOn ? "custom" : "default"} onChange={(x) => setCustom(x.target.value === "custom")}><option value="default">{tr("employees.defaultTiers")}</option><option value="custom">{tr("employees.customForThis")}</option></select></Field>
          {tiersOn && <>
            <Field label={tr("employees.quarterFrom")}><input name="quarterFrom" type="number" min={17} defaultValue={t.quarterFrom} required /></Field>
            <Field label={tr("employees.halfFrom")}><input name="halfFrom" type="number" min={18} defaultValue={t.halfFrom} required /></Field>
            <Field label={tr("employees.dayFrom")}><input name="dayFrom" type="number" min={19} defaultValue={t.dayFrom} required /></Field>
          </>}
          <Field label={tr("employees.specialHours")} wide><input name="fixedSchedule" defaultValue={e.fixedSchedule ?? ""} placeholder={tr("employees.specialHoursPh")} /></Field>
          <Note>{tr("employees.editNote")}</Note>
          <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setTab("file")}>{tr("common.cancel")}</button><button className="btn">{tr("common.save")}</button></div>
        </form>
      )}
    </Drawer>
  );
}
