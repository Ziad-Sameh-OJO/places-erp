"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IdealKpiRowView, IdealKpiView, IdealView } from "@places/contracts";
import { Card, Chip, Empty, Note, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { money } from "@/lib/format";
import { useFields } from "@/lib/me";

const STATUS = { ideal: "ok", penalty: "bad", kpi: "warn" } as const;

/** «الموظف المثالي» (HR, 15/11): the quarter's total KPI score of every salesperson and Team Leader, highest first, each group apart. */
export function IdealEmployee() {
  const t = useTranslations("hr");
  const q = useQuery({ queryKey: ["hr", "ideal-kpi"], queryFn: () => api.get<IdealKpiView>("/hr/ideal-kpi") });
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const group = (title: string, rows: IdealKpiRowView[], withTeam: boolean) => {
    const winners = rows.filter((r) => r.ideal);
    return (
      <Card title={title} icon="star" sub={winners.length ? `${t("kpiIdeal.winner")}: ${winners.map((w) => w.name).join("، ")}` : t("kpiIdeal.nobody")}>
        <Table head={[t("kpiIdeal.rank"), t("common.employee"), ...(withTeam ? [t("kpiIdeal.team")] : []), t("kpiIdeal.score"), ""]} empty={t("kpiIdeal.empty")}
          rows={rows.map((r) => [r.rank ?? "—", <b key="n">{r.name}</b>, ...(withTeam ? [r.team ?? "—"] : []),
            r.score == null ? <span key="s" className="hint">{t("kpiIdeal.noCard")}</span> : <b key="s">{r.score}%</b>,
            r.ideal ? <Chip key="i" tone="ok">{t("kpiIdeal.winner")}</Chip> : ""])} />
      </Card>
    );
  };
  return (
    <>
      <Note>{t("kpiIdeal.sub")}</Note>
      {group(t("kpiIdeal.sales"), q.data.sales, true)}
      {group(t("kpiIdeal.teamLeaders"), q.data.teamLeaders, false)}
      <Note>{t("kpiIdeal.note", { quarter: q.data.quarter ?? "—" })}</Note>
    </>
  );
}

/** M-05 · 7.11 «Employee Box» (demo hr.js idealFund): the attendance-based winner in each team and the fund they receive. */
export function EmployeeBox() {
  const t = useTranslations("hr");
  const fund = useFields("hr").shows("fund"); // M-09: the fund is made of deductions
  const q = useQuery({ queryKey: ["hr", "ideal"], queryFn: () => api.get<IdealView>("/hr/ideal") });
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const team = q.data.teams.find((x) => x.name === open);
  return (
    <Card title={t("ideal.title")} icon="star" sub={t("ideal.sub")}>
      <div className="kpis sm">
        <KpiTile label={t("ideal.early")} value="40%" sub={t("ideal.earlySub")} icon="clock" tone="ok" />
        <KpiTile label={t("ideal.lateHours")} value="30%" sub={t("ideal.lessIsBetter")} icon="alert" tone="warn" />
        <KpiTile label={t("ideal.absent")} value="30%" sub={t("ideal.lessIsBetter")} icon="x" tone="bad" />
      </div>
      <Table head={[t("ideal.team"), t("ideal.winner"), t("ideal.fund"), ""]} empty={t("ideal.noTeams")}
        rows={q.data.teams.map((x) => [
          <span key="t"><b>{x.name}</b><span className="sub">{t("common.employeesCount", { count: x.rows.length })}</span></span>,
          x.winner ? x.winner.name : <Chip key="w" tone="warn">{t("ideal.nobody")}</Chip>,
          fund ? money(x.fund) : "—",
          <button key="b" className="btn ghost sm" onClick={() => setOpen(open === x.name ? null : x.name)}>{open === x.name ? t("ideal.close") : t("ideal.details")}</button>,
        ])} />
      {team && (
        <>
          <h4 className="mini-h">{team.name}</h4>
          <Table head={[t("common.employee"), t("ideal.earlyCol"), t("ideal.lateHoursCol"), t("ideal.absentCol"), t("ideal.kpisCol"), t("ideal.points"), ""]}
            rows={team.rows.map((r) => [r.name, r.earlyDays, r.lateHours.toFixed(1), r.absentDays, r.kpi == null ? "—" : `${r.kpi}%`, <b key="p">{r.points.toFixed(1)}</b>,
              r.status ? <Chip key="s" tone={STATUS[r.status]}>{t(`ideal.status.${r.status}`)}</Chip> : ""])} />
        </>
      )}
      <Note>{t("ideal.note")}</Note>
    </Card>
  );
}
