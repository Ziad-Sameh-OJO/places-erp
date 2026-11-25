"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { TargetMetric, TargetPlan, TargetPlanResult } from "@places/contracts";
import { fromDecimal, spreadTotal, toDecimal, yearQuarters } from "@places/domain";
import { api } from "@/lib/api";
import { dateLocale, num } from "@/lib/format";
import { Card, Empty, Icon, Note, useAction, useToast } from "@/components/ui";

/** A cell's amount in whole units: piasters for money, a count for Transactions and visits. */
const unitsOf = (metric: TargetMetric, c: TargetPlan["people"][number]["cells"][string]) => {
  const src = c.pending ?? c; // what it will be once approved is what the planner builds on
  return metric === "value" ? (src.value === "" ? 0 : fromDecimal(src.value)) : src[metric];
};
/** Shown in pounds (money) or as a count; typed the same way. */
const show = (metric: TargetMetric, u: number) => (metric === "value" ? String(Math.round(u / 100)) : String(u));
const parse = (metric: TargetMetric, s: string) => { const n = Math.max(0, Number(s.replace(/[^\d.]/g, "")) || 0); return metric === "value" ? Math.round(n * 100) : Math.round(n); };
const label = (metric: TargetMetric, u: number) => (metric === "value" ? num(Math.round(u / 100)) : num(u));
const key = (emp: string, m: string) => `${emp}|${m}`;

/**
 * «خطة التارجت» (management, 25 Nov): every salesperson's targets for a year in one grid — a quarter's months with its
 * total, or the year's quarters with its total. A month is typed as it is; a quarter's or the year's total is spread over
 * its months (a closed month keeps its value); «للكل» types the same number for everyone. Nothing is saved until
 * «احفظ»: then each month follows its rule (the current month waits for approval unless you approve).
 */
export function TargetPlanner({ startYear, startQuarter }: { startYear: number; startQuarter: number }) {
  const t = useTranslations("reports.plan");
  const qc = useQueryClient();
  const run = useAction();
  const toast = useToast();
  const [year, setYear] = useState(startYear);
  const [view, setView] = useState<number>(startQuarter); // 1–4 a quarter, 0 the year
  const [metric, setMetric] = useState<TargetMetric>("value");
  const [edits, setEdits] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["reports", "plan", year], queryFn: () => api.get<TargetPlan>(`/reports/targets/plan?year=${year}`) });
  const p = q.data;
  const quarters = useMemo(() => yearQuarters(year), [year]);
  if (!p) return <Empty text={t("loading")} icon="clock" />;

  const lock = new Map(p.months.map((m) => [m.month, m.lock]));
  const editable = p.can.edit && (metric !== "value" || p.can.value);
  const at = (emp: string, m: string) => edits.get(key(emp, m)) ?? unitsOf(metric, p.people.find((x) => x.employeeId === emp)!.cells[m]!);
  const sum = (emp: string, months: string[]) => months.reduce((s, m) => s + at(emp, m), 0);
  const columns: Array<{ id: string; title: string; months: string[]; total?: boolean }> = view
    ? [...quarters[view - 1]!.map((m) => ({ id: m, title: monthName(m), months: [m] })), { id: "q", title: t("quarterTotal", { q: view }), months: quarters[view - 1]!, total: true }]
    : [...quarters.map((ms, i) => ({ id: `Q${i + 1}`, title: `Q${i + 1}`, months: ms })), { id: "y", title: t("yearTotal", { year }), months: quarters.flat(), total: true }];

  /** Typing into a column: a month as it is, a total spread over its months. */
  const put = (next: Map<string, number>, emp: string, months: string[], units: number) => {
    if (months.length === 1) { if (lock.get(months[0]!) !== "closed") next.set(key(emp, months[0]!), units); return; }
    const spread = spreadTotal(units, months.map((m) => at(emp, m)), months.map((m) => lock.get(m) === "closed"));
    months.forEach((m, i) => { if (lock.get(m) !== "closed") next.set(key(emp, m), spread[i]!); });
  };
  const type = (emp: string, months: string[], s: string) => { const next = new Map(edits); put(next, emp, months, parse(metric, s)); setEdits(next); };
  const forAll = (months: string[], s: string) => {
    if (s.trim() === "") return;
    const next = new Map(edits);
    for (const person of p.people) put(next, person.employeeId, months, parse(metric, s));
    setEdits(next);
  };
  // only what really changed goes to the API
  const changed = [...edits].filter(([k, u]) => { const [emp, m] = k.split("|") as [string, string]; return u !== unitsOf(metric, p.people.find((x) => x.employeeId === emp)!.cells[m]!); });
  const switchTo = (fn: () => void) => { if (changed.length && !window.confirm(t("discard"))) return; setEdits(new Map()); fn(); };
  const save = () => {
    setBusy(true);
    void run(async () => {
      try {
        const r = await api.put<TargetPlanResult>("/reports/targets/plan", {
          metric, cells: changed.map(([k, u]) => { const [employeeId, month] = k.split("|") as [string, string]; return { employeeId, month, amount: metric === "value" ? toDecimal(u) : String(u) }; }),
        });
        setEdits(new Map());
        await qc.invalidateQueries({ queryKey: ["reports"] });
        toast([t("result.saved", { n: r.saved }), r.pending ? t("result.pending", { n: r.pending }) : "", r.skipped ? t("result.skipped", { n: r.skipped }) : ""].filter(Boolean).join(" · "));
      } finally { setBusy(false); }
    });
  };
  const head = (c: (typeof columns)[number]) => {
    const l = c.months.length === 1 ? lock.get(c.months[0]!) : null;
    return <th key={c.id} className={c.total ? "tp-total" : ""}>{c.title}{l === "closed" ? <small className="hint">{t("closed")}</small> : l === "approval" ? <small className="tp-warn">{t("needsApproval")}</small> : null}</th>;
  };

  return (
    <Card title={t("title")} icon="trend" sub={t("sub")}>
      <div className="toolbar tp-bar">
        <label className="date-f"><span>{t("year")}</span>
          <select value={year} onChange={(e) => { const y = Number(e.target.value); switchTo(() => setYear(y)); }}>
            {[startYear - 1, startYear, startYear + 1, startYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="seg" role="group" aria-label={t("view")}>
          {[1, 2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={view === n} onClick={() => setView(n)}>Q{n}</button>)}
          <button type="button" aria-pressed={view === 0} onClick={() => setView(0)}>{t("wholeYear")}</button>
        </div>
        <div className="seg" role="group" aria-label={t("metric")}>
          {(["value", "deals", "visits"] as const).map((m) => <button key={m} type="button" aria-pressed={metric === m} onClick={() => switchTo(() => setMetric(m))}>{t(`metrics.${m}`)}</button>)}
        </div>
      </div>
      <Note>{t(view ? "howQuarter" : "howYear")}</Note>
      {!editable && <Note kind="warn">{t("readOnly")}</Note>}
      <div className="tbl-wrap tp-wrap">
        <table className="tp">
          <thead>
            <tr><th>{t("person")}</th>{columns.map(head)}</tr>
            {editable && (
              <tr className="tp-all">
                <th>{t("forAll")}</th>
                {columns.map((c) => (
                  <td key={c.id}><input inputMode="decimal" placeholder="—" aria-label={t("forAllOf", { col: c.title })}
                    disabled={c.months.every((m) => lock.get(m) === "closed")}
                    onKeyDown={(e) => { if (e.key === "Enter") { forAll(c.months, e.currentTarget.value); e.currentTarget.value = ""; } }}
                    onBlur={(e) => { forAll(c.months, e.currentTarget.value); e.currentTarget.value = ""; }} /></td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {p.people.map((person) => (
              <tr key={person.employeeId}>
                <th scope="row"><b>{person.name}</b>{person.tl && <small className="hint">{t("teamOf", { team: person.team ?? "", tl: person.tl })}</small>}</th>
                {columns.map((c) => {
                  const units = c.months.length === 1 ? at(person.employeeId, c.months[0]!) : sum(person.employeeId, c.months);
                  const cell = c.months.length === 1 ? person.cells[c.months[0]!]! : null;
                  const dirty = c.months.some((m) => edits.has(key(person.employeeId, m)) && changed.some(([k]) => k === key(person.employeeId, m)));
                  const closed = c.months.every((m) => lock.get(m) === "closed");
                  return (
                    <td key={c.id} className={`${c.total ? "tp-total" : ""} ${dirty ? "tp-dirty" : ""}`}>
                      {editable && !closed
                        ? <input inputMode="decimal" value={show(metric, units)} aria-label={t("cellOf", { name: person.name, col: c.title })} onChange={(e) => type(person.employeeId, c.months, e.target.value)} />
                        : <span className="num">{label(metric, units)}</span>}
                      {cell && !cell.saved && metric === "value" && !edits.has(key(person.employeeId, c.months[0]!)) && <small className="hint">{t("standing")}</small>}
                      {cell?.pending && <small className="tp-warn">{t("pending", { by: cell.pending.by })}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!p.people.length && <tr><td colSpan={columns.length + 1}><Empty text={t("nobody")} icon="users" /></td></tr>}
          </tbody>
          <tfoot>
            <tr><th>{t("total")}</th>{columns.map((c) => <td key={c.id} className={c.total ? "tp-total" : ""}><b className="num">{label(metric, p.people.reduce((s, x) => s + sum(x.employeeId, c.months), 0))}</b></td>)}</tr>
          </tfoot>
        </table>
      </div>
      {changed.length > 0 && (
        <div className="tp-save">
          <span>{t("changes", { n: changed.length })}</span><span className="spacer" />
          <button type="button" className="btn ghost" onClick={() => setEdits(new Map())}>{t("undo")}</button>
          <button type="button" className="btn" disabled={busy} onClick={save}><Icon name="check" />{t("save")}</button>
        </div>
      )}
    </Card>
  );
}

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(dateLocale(), { month: "long", timeZone: "UTC" });
