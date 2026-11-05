"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IdealView } from "@places/contracts";
import { Card, Chip, Empty, Note, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

const STATUS = { ideal: ["ok", "المثالي"], penalty: ["bad", "جزاء إداري"], kpi: ["warn", "KPIs أقل من 80%"] } as const;

/** M-05 · 7.11 «الموظف المثالي وصندوق الفريق» (demo hr.js idealFund): the winner in each team and what they receive. */
export function IdealEmployee() {
  const q = useQuery({ queryKey: ["hr", "ideal"], queryFn: () => api.get<IdealView>("/hr/ideal") });
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data) return <Empty text="بيحمّل…" icon="clock" />;
  const team = q.data.teams.find((t) => t.name === open);
  return (
    <Card title="الموظف المثالي وصندوق الفريق" icon="star" sub="خصومات الحضور والتأخير لباقي الفريق بتروح للموظف المثالي آخر الشهر">
      <div className="kpis sm">
        <KpiTile label="الحضور بدري" value="40%" sub="أيام قبل الميعاد · الأكتر أحسن" icon="clock" tone="ok" />
        <KpiTile label="ساعات التأخير" value="30%" sub="الأقل أحسن" icon="alert" tone="warn" />
        <KpiTile label="غياب من غير إذن" value="30%" sub="الأقل أحسن" icon="x" tone="bad" />
      </div>
      <Table head={["الفريق", "الموظف المثالي", "الصندوق (هيستلمه)", ""]} empty="مفيش فرق ليك"
        rows={q.data.teams.map((t) => [
          <span key="t"><b>{t.name}</b><span className="sub">{t.rows.length} موظف</span></span>,
          t.winner ? t.winner.name : <Chip key="w" tone="warn">مفيش حد مستوفي الشروط</Chip>,
          money(t.fund),
          <button key="b" className="btn ghost sm" onClick={() => setOpen(open === t.name ? null : t.name)}>{open === t.name ? "اقفل" : "التفاصيل"}</button>,
        ])} />
      {team && (
        <>
          <h4 className="mini-h">{team.name}</h4>
          <Table head={["الموظف", "بدري", "ساعات تأخير", "غياب", "الـ KPIs", "النقاط", ""]}
            rows={team.rows.map((r) => [r.name, r.earlyDays, r.lateHours.toFixed(1), r.absentDays, r.kpi == null ? "—" : `${r.kpi}%`, <b key="p">{r.points.toFixed(1)}</b>,
              r.status ? <Chip key="s" tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Chip> : ""])} />
        </>
      )}
      <Note>الشروط: الـ KPIs الكلية 80% أو أكتر، ومفيش جزاء إداري في الشهر. لو اتعادلوا: الأعلى في التارجت، وبعدين الأعلى في نسبة الـ KPI. القيمة = مجموع خصومات الحضور والتأخير لباقي الفريق في الشهر (مثال: فريق من 5، خصومات الـ 4 = 3,000 جنيه، يستلمها الموظف المثالي).</Note>
    </Card>
  );
}
