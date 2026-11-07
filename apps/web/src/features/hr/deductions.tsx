"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeductionsView } from "@places/contracts";
import { Empty, Icon, Note, Table, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, money } from "@/lib/format";
import { moneyChip } from "../kpis/kpis-page";
import { useTranslations } from "next-intl";

/** M-05 · «التوفير» (7.9): the month's deductions (attendance + approved penalties); HR approves them once and they go to payroll. */
export function Deductions() {
  const t = useTranslations("hr");
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["hr", "deductions"], queryFn: () => api.get<DeductionsView>("/hr/deductions") });
  const d = q.data;
  if (!d) return <Empty text={t("common.loading")} icon="clock" />;
  const approve = () => run(async () => { await api.post("/hr/deductions/approve"); await qc.invalidateQueries({ queryKey: ["hr", "deductions"] }); }, t("deductions.approvedOk"));
  const rows = d.rows.filter((r) => Number(r.amount) || Number(r.kpi) || r.lateMinutes).sort((a, b) => Number(b.amount) - Number(a.amount));
  const saved = Number(d.totals.salary) ? ((Number(d.totals.amount) / Number(d.totals.salary)) * 100).toFixed(1) : "0";
  return (
    <>
      <div className="kpis">
        <KpiTile label={t("deductions.payroll")} value={money(d.totals.salary)} sub={t("common.employeesCount", { count: d.totals.people })} icon="id" />
        <KpiTile label={t("deductions.monthDeductions")} value={money(d.totals.amount)} sub={t("deductions.monthDeductionsSub")} icon="wallet" tone="bad" />
        <KpiTile label={t("deductions.net")} value={money(d.totals.net)} sub={t("deductions.netSub")} icon="bank" tone="ok" />
        <KpiTile label={t("deductions.saved")} value={`${saved}%`} sub={t("deductions.savedSub")} icon="trend" tone="warn" />
      </div>
      <Table head={[t("common.employee"), t("common.salary"), t("common.deductionDays"), t("deductions.quarterKpi"), t("common.deductionAmount"), t("deductions.netSalary"), t("common.lateMinutes")]} empty={t("deductions.empty")}
        rows={rows.map((r) => [<b key="n">{r.name}</b>, money(r.salary),
          <span key="d">{r.attendanceDays + r.penaltyDays}{r.penaltyDays > 0 && <span className="sub">{t("deductions.ofThemPenalty", { n: r.penaltyDays })}</span>}</span>,
          moneyChip(r.kpi) ?? "—", money(r.amount), money(r.net), t("common.minutes", { n: r.lateMinutes })])} />
      {d.approved
        ? <Note kind="ok">{t("deductions.approvedNote", { by: d.approved.by, when: ago(d.approved.at) })}</Note>
        : <Note kind="warn"><span className="spacer">{t("deductions.notApproved")}</span>
            {can("hr", "approve") && can("hr", "edit") && <button className="btn sm" onClick={() => void approve()}><Icon name="check" />{t("deductions.approveBtn")}</button>}</Note>}
      <Note>{t("deductions.note")}</Note>
    </>
  );
}
