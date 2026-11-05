"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeductionsView } from "@places/contracts";
import { Empty, Icon, Note, Table, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, money } from "@/lib/format";

/** M-05 · «التوفير» (7.9): the month's deductions (attendance + approved penalties); HR approves them once and they go to payroll. */
export function Deductions() {
  const { can } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["hr", "deductions"], queryFn: () => api.get<DeductionsView>("/hr/deductions") });
  const d = q.data;
  if (!d) return <Empty text="بيحمّل…" icon="clock" />;
  const approve = () => run(async () => { await api.post("/hr/deductions/approve"); await qc.invalidateQueries({ queryKey: ["hr", "deductions"] }); }, "الخصومات اتعتمدت واترحّلت للمالية");
  const rows = d.rows.filter((r) => Number(r.amount) || r.lateMinutes).sort((a, b) => Number(b.amount) - Number(a.amount));
  const saved = Number(d.totals.salary) ? ((Number(d.totals.amount) / Number(d.totals.salary)) * 100).toFixed(1) : "0";
  return (
    <>
      <div className="kpis">
        <KpiTile label="موازنة المرتبات / شهر" value={money(d.totals.salary)} sub={`${d.totals.people} موظف`} icon="id" />
        <KpiTile label="الخصومات الشهر ده" value={money(d.totals.amount)} sub="تأخير وغياب ونسيان بصمة" icon="wallet" tone="bad" />
        <KpiTile label="المرتبات بعد الخصم" value={money(d.totals.net)} sub="بتسمع في المالية M-07" icon="bank" tone="ok" />
        <KpiTile label="وفّرنا" value={`${saved}%`} sub="من الموازنة" icon="trend" tone="warn" />
      </div>
      <Table head={["الموظف", "المرتب", "أيام الخصم", "مبلغ الخصم", "المرتب بعد الخصم", "دقايق التأخير"]} empty="مفيش خصومات الشهر ده"
        rows={rows.map((r) => [<b key="n">{r.name}</b>, money(r.salary),
          <span key="d">{r.attendanceDays + r.penaltyDays}{r.penaltyDays > 0 && <span className="sub">منهم {r.penaltyDays} جزاء</span>}</span>,
          money(r.amount), money(r.net), `${r.lateMinutes} د`])} />
      {d.approved
        ? <Note kind="ok">خصومات الشهر اتعتمدت من {d.approved.by} {ago(d.approved.at)} واترحّلت للمالية.</Note>
        : <Note kind="warn"><span className="spacer">خصومات الشهر لسه مااتعتمدتش، فمش ظاهرة في المالية.</span>
            {can("hr", "approve") && can("hr", "edit") && <button className="btn sm" onClick={() => void approve()}><Icon name="check" />اعتمد الخصومات وابعتها للمالية</button>}</Note>}
      <Note>الخصم = أيام الخصم × (المرتب ÷ 26)، والجزاءات اللي الـ HR وافقت عليها داخلة فيه. والإعدادات الخاصة بكل موظف بتغيّر شرايح الخصم بس، ودقايق الـ Weekly Delay بتتحسب بنفس الطريقة للكل.</Note>
    </>
  );
}
