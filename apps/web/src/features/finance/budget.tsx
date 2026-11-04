"use client";
import type { BudgetRow } from "@places/contracts";
import { Chip, Empty, Note, Table, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useBudget, useRefreshFinance } from "./use-finance";

const PERIOD: Record<string, string> = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };

/** M-07 · «البادجت» (9.2): every expense account, its budget for its period, spent, left, and the alert %. */
export function Budget() {
  const { can } = useMe();
  const q = useBudget();
  const run = useAction();
  const refresh = useRefreshFinance();
  if (!q.data) return <Empty text="بيحمّل…" icon="clock" />;
  const ed = can("finance", "edit");
  const { rows, totals } = q.data;
  const save = (r: BudgetRow, patch: Record<string, unknown>) => run(async () => { await api.patch(`/finance/budget/${r.accountId}`, patch); await refresh(); }, "اتحفظ");
  const num = (r: BudgetRow) => ed
    ? <input key="b" className="sm" style={{ width: 110 }} inputMode="decimal" defaultValue={r.budget ?? ""} placeholder="مالوش بادجت" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.budget ?? "") && /^\d+(\.\d{1,2})?$/.test(v)) void save(r, { budget: v }); }} />
    : r.budget ? money(r.budget) : "—";
  return (
    <>
      <div className="kpis">
        <KpiTile label="إجمالي البادجت" value={money(totals.budget)} sub={`${rows.filter((r) => r.budget).length} بند ليه بادجت`} icon="wallet" />
        <KpiTile label="اتصرف" value={money(totals.spent)} sub="في فترة كل بند" icon="trend" />
        <KpiTile label="فاضل" value={money(totals.left)} icon="layers" tone={Number(totals.left) < 0 ? "bad" : "ok"} />
        <KpiTile label="بنود عدّت التنبيه" value={totals.alerts} sub="قرّبت تخلص أو عدّت" icon="clock" {...(totals.alerts ? { tone: "bad" as const } : {})} />
      </div>
      <Note>البادجت لكل بند مصروف من الشجرة. «اتصرف» = حركات الحساب في فترة البند. لما البند يوصل نسبة التنبيه أو يعدّي البادجت، المحاسب بيجيله إشعار.</Note>
      <Table head={["البند", "تحت", "البادجت", "الفترة", "اتصرف", "فاضل", "التنبيه %", ""]}
        rows={rows.map((r) => [
          <span key="n"><span className="mono hint">{r.code}</span> {r.name}</span>, r.group, num(r),
          ed ? <select key="p" value={r.period} onChange={(e) => void save(r, { period: e.target.value })}>{Object.entries(PERIOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : PERIOD[r.period],
          money(r.spent), r.left != null ? <b key="l" className={Number(r.left) < 0 ? "bad-t" : ""}>{money(r.left)}</b> : "—",
          ed ? <input key="a" className="sm" style={{ width: 60 }} type="number" min={1} max={100} defaultValue={r.alert} onBlur={(e) => { const v = Number(e.target.value); if (v !== r.alert && v >= 1 && v <= 100) void save(r, { alert: v }); }} /> : `${r.alert}%`,
          r.level ? <Chip key="lv" tone={r.level}>{r.pct}%{r.level === "bad" ? " · عدّى البادجت" : r.level === "warn" ? " · قرّب يخلص" : ""}</Chip> : "",
        ])} />
    </>
  );
}
