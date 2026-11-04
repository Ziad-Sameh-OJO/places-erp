"use client";
import { useState } from "react";
import type { BudgetRow } from "@places/contracts";
import { Chip, Empty, ExportButton, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useBudget, useRefreshFinance } from "./use-finance";
import { LedgerModal } from "./ledger-modal";

const PERIOD: Record<string, string> = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };
type Filter = "" | "52" | "53" | "other" | "over" | "none";

/**
 * M-07 · «البادجت» (9.2 · 9.9): every expense account with its budget for its period, spent (opens the account's
 * statement), left, the alert %, the owner, stop / start, filters, «بند جديد بالبادجت بتاعه», and the Excel export.
 */
export function Budget() {
  const { can } = useMe();
  const q = useBudget();
  const run = useAction();
  const refresh = useRefreshFinance();
  const [f, setF] = useState<Filter>("");
  const [ledger, setLedger] = useState<string | null>(null);
  if (!q.data) return <Empty text="بيحمّل…" icon="clock" />;
  const ed = can("finance", "edit");
  const { rows, totals, people } = q.data;
  const save = (r: BudgetRow, patch: Record<string, unknown>) => run(async () => { await api.patch(`/finance/budget/${r.accountId}`, patch); await refresh(); }, "اتحفظ");
  const shown = rows.filter((r) => !f || (f === "over" ? r.level === "warn" || r.level === "bad" : f === "none" ? !r.budget : f === "other" ? !/^5[23]/.test(r.code) : r.code.startsWith(f)));
  const add = onFormSubmit(async (d) => run(async () => {
    await api.post("/finance/budget", { parent: d.get("parent"), name: d.get("name"), budget: d.get("budget"), period: d.get("period"), alert: Number(d.get("alert")), ...(d.get("ownerId") ? { ownerId: d.get("ownerId") } : {}) });
    await refresh();
  }, "اتضاف البند واتفتحله حساب في الشجرة"));
  const amount = (r: BudgetRow) => ed
    ? <input key={`b${r.budget}`} style={{ width: 110 }} inputMode="decimal" defaultValue={r.budget ?? ""} placeholder="مالوش بادجت" aria-label={`بادجت ${r.name}`}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.budget ?? "") && /^\d+(\.\d{1,2})?$/.test(v)) void save(r, { budget: v }); }} />
    : r.budget ? money(r.budget) : "—";
  return (
    <>
      <div className="kpis">
        <KpiTile label="إجمالي البادجت" value={money(totals.budget)} sub={`${rows.filter((r) => r.budget).length} بند ليه بادجت`} icon="wallet" />
        <KpiTile label="اتصرف" value={money(totals.spent)} sub="في فترة كل بند" icon="trend" />
        <KpiTile label="فاضل" value={money(totals.left)} icon="layers" tone={Number(totals.left) < 0 ? "bad" : "ok"} />
        <KpiTile label="بنود عدّت التنبيه" value={totals.alerts} sub="قرّبت تخلص أو عدّت" icon="clock" {...(totals.alerts ? { tone: "bad" as const } : {})} onClick={() => setF("over")} />
      </div>
      <Note>البادجت لكل بند مصروف من الشجرة. «اتصرف» = حركات الحساب في فترة البند (دوس عليه تشوف التفاصيل). لما البند يوصل نسبة التنبيه أو يعدّي البادجت، المحاسب والمسؤول بيجيلهم إشعار.</Note>
      <div className="row">
        <select value={f} onChange={(e) => setF(e.target.value as Filter)} aria-label="فلتر البنود">
          <option value="">كل البنود</option><option value="52">52 · مصروفات ادارية</option><option value="53">53 · مصروفات بيعية</option><option value="other">مصروفات تانية (54–58)</option>
          <option value="over">عدّت التنبيه</option><option value="none">مالهاش بادجت</option>
        </select>
        <span className="spacer" />
        <ExportButton module="finance" path="/finance/budget/export" filename="البادجت.xlsx" />
      </div>
      <Table head={["البند", "تحت", "البادجت", "الفترة", "اتصرف", "فاضل", "التنبيه %", "المسؤول", ""]} empty="مفيش بنود"
        rows={shown.map((r) => [
          <span key="n" className={r.active ? "" : "hint"}><span className="mono hint">{r.code}</span> {r.name}</span>, r.group, amount(r),
          ed ? <select key="p" value={r.period} onChange={(e) => void save(r, { period: e.target.value })} aria-label="الفترة">{Object.entries(PERIOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : PERIOD[r.period],
          <a key="s" className="click" onClick={() => setLedger(r.accountId)}>{money(r.spent)}</a>,
          r.left != null ? <b key="l" className={Number(r.left) < 0 ? "bad-t" : ""}>{money(r.left)}</b> : "—",
          ed ? <input key={`a${r.alert}`} style={{ width: 60 }} type="number" min={1} max={100} defaultValue={r.alert} aria-label="التنبيه %" onBlur={(e) => { const v = Number(e.target.value); if (v !== r.alert && v >= 1 && v <= 100) void save(r, { alert: v }); }} /> : `${r.alert}%`,
          ed ? <select key="o" value={r.owner?.userId ?? ""} onChange={(e) => void save(r, { ownerId: e.target.value || null })} aria-label="المسؤول"><option value="">—</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select> : r.owner?.name ?? "—",
          <span key="x" className="row">
            {r.level && <Chip tone={r.level}>{r.pct}%{r.level === "bad" ? " · عدّى البادجت" : r.level === "warn" ? " · قرّب يخلص" : ""}</Chip>}
            {ed && r.budget && <button className="btn ghost sm" onClick={() => void save(r, { active: !r.active })}>{r.active ? "وقّف" : "شغّل"}</button>}
          </span>,
        ])} />
      {ed && (
        <form className="card flat grid" onSubmit={add}>
          <h3 className="mini-h wide"><Icon name="plus" /> بند جديد بالبادجت بتاعه</h3>
          <Field label="اسم البند" req><input name="name" required minLength={2} placeholder="مثلاً: صيانة التكييفات" /></Field>
          <Field label="تحت" req><select name="parent" defaultValue="52"><option value="52">52 · مصروفات ادارية</option><option value="53">53 · مصروفات بيعية</option></select></Field>
          <Field label="البادجت" req><input name="budget" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
          <Field label="الفترة"><select name="period" defaultValue="month">{Object.entries(PERIOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="نبّهني عند %"><input name="alert" type="number" min={1} max={100} defaultValue={80} /></Field>
          <Field label="المسؤول"><select name="ownerId" defaultValue=""><option value="">—</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select></Field>
          <div className="row end wide"><button className="btn"><Icon name="plus" />ضيف البند</button></div>
        </form>
      )}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
