"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeductionsView } from "@places/contracts";
import { Empty, Icon, Note, Table, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { ago, money } from "@/lib/format";
import { moneyChip } from "../kpis/kpis-page";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** M-05 · «التوفير» (7.9): the month's deductions (attendance + approved penalties); HR approves them once and they go to payroll. */
export function Deductions() {
  const t = useTranslations("hr");
  const { can } = useMe();
  const fields = useFields("hr");
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["hr", "deductions"], queryFn: () => api.get<DeductionsView>("/hr/deductions") });
  const d = q.data;
  if (!d) return <Empty text={t("common.loading")} icon="clock" />;
  const approve = () => run(async () => { await api.post("/hr/deductions/approve"); await qc.invalidateQueries({ queryKey: ["hr", "deductions"] }); }, t("deductions.approvedOk"));
  const rows = d.rows.filter((r) => Number(r.amount) || Number(r.kpi) || r.lateMinutes).sort((a, b) => Number(b.amount) - Number(a.amount));
  // M-09 field permissions: a hidden amount's column and tile aren't there (the API sends it blank anyway)
  const cols = ([
    ["name", t("common.employee"), (r) => <b key="n">{r.name}</b>],
    ["salary", t("common.salary"), (r) => money(r.salary)],
    ["days", t("common.deductionDays"), (r) => <span key="d">{r.attendanceDays + r.penaltyDays}{r.penaltyDays > 0 && <span className="sub">{t("deductions.ofThemPenalty", { n: r.penaltyDays })}</span>}</span>],
    ["kpi", t("deductions.quarterKpi"), (r) => moneyChip(r.kpi) ?? "—"],
    ["amount", t("common.deductionAmount"), (r) => money(r.amount)],
    ["net", t("deductions.netSalary"), (r) => money(r.net)],
    ["late", t("common.lateMinutes"), (r) => t("common.minutes", { n: r.lateMinutes })],
  ] as [string, string, (r: DeductionsView["rows"][number]) => ReactNode][]).filter(([k]) => fields.shows(k));
  const saved = Number(d.totals.salary) ? ((Number(d.totals.amount) / Number(d.totals.salary)) * 100).toFixed(1) : "0";
  return (
    <>
      <div className="kpis">
        {fields.shows("salary") && <KpiTile label={t("deductions.payroll")} value={money(d.totals.salary)} sub={t("common.employeesCount", { count: d.totals.people })} icon="id" />}
        {fields.shows("amount") && <KpiTile label={t("deductions.monthDeductions")} value={money(d.totals.amount)} sub={t("deductions.monthDeductionsSub")} icon="wallet" tone="bad" />}
        {fields.shows("net") && <KpiTile label={t("deductions.net")} value={money(d.totals.net)} sub={t("deductions.netSub")} icon="bank" tone="ok" />}
        {fields.shows("salary") && fields.shows("amount") && <KpiTile label={t("deductions.saved")} value={`${saved}%`} sub={t("deductions.savedSub")} icon="trend" tone="warn" />}
      </div>
      <Table head={cols.map(([, h]) => h)} empty={t("deductions.empty")} rows={rows.map((r) => cols.map(([, , cell]) => cell(r)))} />
      {d.approved
        ? <Note kind="ok">{t("deductions.approvedNote", { by: d.approved.by, when: ago(d.approved.at) })}</Note>
        : <Note kind="warn"><span className="spacer">{t("deductions.notApproved")}</span>
            {can("hr", "approve") && can("hr", "edit") && <button className="btn sm" onClick={() => void approve()}><Icon name="check" />{t("deductions.approveBtn")}</button>}</Note>}
      <Note>{t("deductions.note")}</Note>
    </>
  );
}
