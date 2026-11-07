"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BudgetRow } from "@places/contracts";
import { Chip, Empty, ExportButton, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useBudget, useRefreshFinance } from "./use-finance";
import { LedgerModal } from "./ledger-modal";

const PERIODS = ["month", "quarter", "year"] as const;
type Period = (typeof PERIODS)[number];
type Filter = "" | "52" | "53" | "other" | "over" | "none";

/**
 * M-07 · «البادجت» (9.2 · 9.9): every expense account with its budget for its period, spent (opens the account's
 * statement), left, the alert %, the owner, stop / start, filters, «بند جديد بالبادجت بتاعه», and the Excel export.
 */
export function Budget() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const q = useBudget();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [f, setF] = useState<Filter>("");
  const [ledger, setLedger] = useState<string | null>(null);
  if (!q.data) return <Empty text={t("common.loading")} icon="clock" />;
  const ed = can("finance", "edit");
  const { rows, totals, people } = q.data;
  const budgeted = rows.filter((r) => r.budget).length;
  const period = (p: string) => t(`budget.period.${p as Period}`);
  const save = (r: BudgetRow, patch: Record<string, unknown>) => run(async () => { await api.patch(`/finance/budget/${r.accountId}`, patch); await refresh(); }, t("common.saved"));
  const shown = rows.filter((r) => !f || (f === "over" ? r.level === "warn" || r.level === "bad" : f === "none" ? !r.budget : f === "other" ? !/^5[23]/.test(r.code) : r.code.startsWith(f)));
  const add = onFormSubmit(async (d) => run(async () => {
    await api.post("/finance/budget", { parent: d.get("parent"), name: d.get("name"), budget: d.get("budget"), period: d.get("period"), alert: Number(d.get("alert")), ...(d.get("ownerId") ? { ownerId: d.get("ownerId") } : {}) });
    await refresh();
  }, t("budget.added")));
  const amount = (r: BudgetRow) => ed
    ? <input key={`b${r.budget}`} style={{ width: 110 }} inputMode="decimal" defaultValue={r.budget ?? ""} placeholder={t("budget.noBudget")} aria-label={t("budget.budgetOf", { name: serverText(r.name) })}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.budget ?? "") && /^\d+(\.\d{1,2})?$/.test(v)) void save(r, { budget: v }); }} />
    : r.budget ? money(r.budget) : "—";
  const periodOptions = PERIODS.map((k) => <option key={k} value={k}>{period(k)}</option>);
  return (
    <>
      <div className="kpis">
        <KpiTile label={t("budget.total")} value={money(totals.budget)} sub={t("budget.withBudget", { count: budgeted, n: String(budgeted) })} icon="wallet" />
        <KpiTile label={t("budget.spent")} value={money(totals.spent)} sub={t("budget.spentSub")} icon="trend" />
        <KpiTile label={t("budget.left")} value={money(totals.left)} icon="layers" tone={Number(totals.left) < 0 ? "bad" : "ok"} />
        <KpiTile label={t("budget.alerts")} value={totals.alerts} sub={t("budget.alertsSub")} icon="clock" {...(totals.alerts ? { tone: "bad" as const } : {})} onClick={() => setF("over")} />
      </div>
      <Note>{t("budget.note")}</Note>
      <div className="row">
        <select value={f} onChange={(e) => setF(e.target.value as Filter)} aria-label={t("budget.filter")}>
          <option value="">{t("budget.all")}</option><option value="52">{t("budget.g52")}</option><option value="53">{t("budget.g53")}</option><option value="other">{t("budget.other")}</option>
          <option value="over">{t("budget.over")}</option><option value="none">{t("budget.none")}</option>
        </select>
        <span className="spacer" />
        <ExportButton module="finance" path="/finance/budget/export" filename={t("budget.file")} label={t("common.exportExcel")} />
      </div>
      <Table head={[t("common.item"), t("budget.under"), t("budget.budget"), t("budget.periodLabel"), t("budget.spent"), t("budget.left"), t("budget.alertPct"), t("common.owner"), ""]} empty={t("budget.empty")}
        rows={shown.map((r) => [
          <span key="n" className={r.active ? "" : "hint"}><span className="mono hint">{r.code}</span> {serverText(r.name)}</span>, serverText(r.group), amount(r),
          ed ? <select key="p" value={r.period} onChange={(e) => void save(r, { period: e.target.value })} aria-label={t("budget.periodLabel")}>{periodOptions}</select> : period(r.period),
          <a key="s" className="click" onClick={() => setLedger(r.accountId)}>{money(r.spent)}</a>,
          r.left != null ? <b key="l" className={Number(r.left) < 0 ? "bad-t" : ""}>{money(r.left)}</b> : "—",
          ed ? <input key={`a${r.alert}`} style={{ width: 60 }} type="number" min={1} max={100} defaultValue={r.alert} aria-label={t("budget.alertPct")} onBlur={(e) => { const v = Number(e.target.value); if (v !== r.alert && v >= 1 && v <= 100) void save(r, { alert: v }); }} /> : `${r.alert}%`,
          ed ? <select key="o" value={r.owner?.userId ?? ""} onChange={(e) => void save(r, { ownerId: e.target.value || null })} aria-label={t("common.owner")}><option value="">—</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select> : r.owner?.name ?? "—",
          <span key="x" className="row">
            {r.level && <Chip tone={r.level}>{r.pct}%{r.level === "bad" ? ` · ${t("budget.overBudget")}` : r.level === "warn" ? ` · ${t("budget.nearEnd")}` : ""}</Chip>}
            {ed && r.budget && <button className="btn ghost sm" onClick={() => void save(r, { active: !r.active })}>{r.active ? t("budget.stop") : t("budget.start")}</button>}
          </span>,
        ])} />
      {ed && (
        <form className="card flat grid" onSubmit={add}>
          <h3 className="mini-h wide"><Icon name="plus" /> {t("budget.newTitle")}</h3>
          <Field label={t("budget.name")} req><input name="name" required minLength={2} placeholder={t("budget.namePlaceholder")} /></Field>
          <Field label={t("budget.under")} req><select name="parent" defaultValue="52"><option value="52">{t("budget.g52")}</option><option value="53">{t("budget.g53")}</option></select></Field>
          <Field label={t("budget.budget")} req><input name="budget" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
          <Field label={t("budget.periodLabel")}><select name="period" defaultValue="month">{periodOptions}</select></Field>
          <Field label={t("budget.alertAt")}><input name="alert" type="number" min={1} max={100} defaultValue={80} /></Field>
          <Field label={t("common.owner")}><select name="ownerId" defaultValue=""><option value="">—</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select></Field>
          <div className="row end wide"><button className="btn"><Icon name="plus" />{t("budget.add")}</button></div>
        </form>
      )}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
