"use client";
import { useState, type ReactNode } from "react";
import type { AccountNode, IncomeView, StatementLineView } from "@places/contracts";
import { Card, Chip, Empty, Icon, Modal, Note, Table } from "@/components/ui";
import { money, short } from "@/lib/format";
import { useChart, useIncome } from "./use-finance";
import { LedgerModal } from "./ledger-modal";

type Why = { title: string; rows: [string, string][]; total: [string, string]; path: string };

/**
 * 9.7 · قايمة الدخل (demo pnl()): «الشهر ده» or «من أول السنة», in Dr. Ali's stages. Every account line opens its
 * statement (where its balance came from); every total opens how it's computed and what it feeds into, up to net profit.
 */
export function IncomeStatement() {
  const [range, setRange] = useState<"month" | "year">("month");
  const q = useIncome(range);
  const [ledger, setLedger] = useState<string | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const s = q.data;
  const seg = (
    <div className="row">
      <div className="seg" role="group">
        <button aria-pressed={range === "month"} onClick={() => setRange("month")}>الشهر ده{s && range === "month" ? ` · ${s.label}` : ""}</button>
        <button aria-pressed={range === "year"} onClick={() => setRange("year")}>من أول السنة</button>
      </div>
      <span className="hint spacer">{range === "month" ? "اللي حصل الشهر ده بس (الأذونات والقيود بتاريخها)" : "من أول السنة لحد النهارده"} · دوس على أي رقم تشوف وصل لكده إزاي وعدّى على إيه</span>
    </div>
  );
  if (!s) return <>{seg}<Empty text="بيحمّل…" icon="clock" /></>;
  const show = (ls: StatementLineView[]) => ls.filter((l) => range === "year" || Number(l.value));
  const row = (label: string, value: string | number, cls: string, onClick: () => void, sign = 1): ReactNode => {
    const v = Number(value) * sign;
    return <tr key={label} className={`${cls} ${v < 0 ? "neg" : ""} click`} onClick={onClick}><td>{label} <span className="hint"><Icon name="search" /></span></td><td className="n">{money(v.toFixed(2))}</td></tr>;
  };
  const leaf = (l: StatementLineView, sign: number) => row(`${l.code} · ${l.name}`, l.value, "sub", () => setLedger(l.id), sign);
  const explain = (title: string, parts: [string, string][], total: string, path: string) => () => setWhy({ title, rows: parts, total: [title, total], path });
  const PATH = { rev: "الإيرادات ← ربح الصفقات ← ربح النشاط ← صافي الربح", dir: "المصاريف المباشرة ← ربح الصفقات ← ربح النشاط ← صافي الربح", sel: "المصروفات البيعية ← ربح النشاط ← صافي الربح", adm: "المصروفات الإدارية ← صافي الربح", oth: "المصروفات ← صافي الربح" };
  const sumOf = (ls: StatementLineView[]): [string, string][] => ls.filter((l) => Number(l.value)).map((l) => [`${l.code} · ${l.name}`, l.value]);
  return (
    <>
      {seg}
      <div className="tbl-wrap pnl"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
        {row("4 · الإيرادات", s.revenue, "", explain("الإيرادات", sumOf(s.lines.revenue), s.revenue, PATH.rev))}{show(s.lines.revenue).map((l) => leaf(l, 1))}
        {row("ناقص: المصاريف المباشرة (العمولات)", s.direct, "", explain("المصاريف المباشرة", sumOf(s.lines.direct), s.direct, PATH.dir), -1)}{show(s.lines.direct).map((l) => leaf(l, -1))}
        {row("ربح الصفقات", s.gross, "total", explain("ربح الصفقات", [["الإيرادات", s.revenue], ["ناقص المصاريف المباشرة", `-${s.direct}`]], s.gross, "ربح الصفقات ← ربح النشاط ← صافي الربح"))}
        {row("ناقص: 53 · مصروفات بيعية (من غير العمولات)", s.selling, "", explain("المصروفات البيعية", sumOf(s.lines.selling), s.selling, PATH.sel), -1)}{show(s.lines.selling).map((l) => leaf(l, -1))}
        {row("ربح النشاط", s.contribution, "total", explain("ربح النشاط", [["ربح الصفقات", s.gross], ["ناقص المصروفات البيعية", `-${s.selling}`]], s.contribution, "ربح النشاط ← صافي الربح"))}
        {row("ناقص: 52 · مصروفات إدارية", s.admin, "", explain("المصروفات الإدارية", sumOf(s.lines.admin), s.admin, PATH.adm), -1)}{show(s.lines.admin).map((l) => leaf(l, -1))}
        {s.lines.other.map((o) => <OtherRows key={o.head.code} o={o} range={range} row={row} leaf={leaf} onWhy={explain(o.head.name, sumOf(o.lines.length ? o.lines : [o.head]), o.head.value, PATH.oth)} onLedger={() => setLedger(o.head.id)} />)}
        {row("صافي الربح", s.net, "total grand", explain("صافي الربح", [["ربح النشاط", s.contribution], ["ناقص المصروفات الإدارية", `-${s.admin}`], ["ناقص المصروفات التانية (54–58)", `-${s.other}`]], s.net, "= ح/ 34 «أرباح وخسائر العام»"))}
      </tbody></table></div>
      <Note>قايمة الدخل كل شهر، والميزانية العمومية كل 3 شهور، وصافي الربح في أي وقت. الأرقام هنا هي نفس أرصدة شجرة الحسابات، فأي إذن أو قيد بيظهر هنا على طول. صافي الربح من أول السنة = ح/ 34.</Note>
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
      {why && (
        <Modal title={why.title} onClose={() => setWhy(null)}>
          <Table head={["بيتحسب من", "المبلغ"]} empty="مفيش حركات في الفترة دي" rows={[...why.rows.map(([l, v]) => [l, money(v)]), [<b key="t">{why.total[0]}</b>, <b key="v">{money(why.total[1])}</b>]]} />
          <p className="hint">بيدخل في: {why.path}</p>
        </Modal>
      )}
    </>
  );
}

function OtherRows({ o, range, row, leaf, onWhy, onLedger }: { o: IncomeView["lines"]["other"][number]; range: string; row: (l: string, v: string, c: string, f: () => void, s?: number) => ReactNode; leaf: (l: StatementLineView, s: number) => ReactNode; onWhy: () => void; onLedger: () => void }) {
  if (range === "month" && !Number(o.head.value)) return null;
  return <>{row(`ناقص: ${o.head.code} · ${o.head.name}`, o.head.value, "", o.lines.length ? onWhy : onLedger, -1)}{o.lines.filter((l) => range === "year" || Number(l.value)).map((l) => leaf(l, -1))}</>;
}

/** 9.7 · الميزانية العمومية (demo bs()): assets, liabilities, equity; each item opens its sub-accounts, each account its statement. */
export function BalanceSheet() {
  const chart = useChart();
  const [ledger, setLedger] = useState<string | null>(null);
  if (!chart.data) return <Empty text="بيحمّل…" icon="clock" />;
  const { roots, check } = chart.data;
  const leaves = (n: AccountNode): AccountNode[] => (n.children.length ? n.children.flatMap(leaves) : [n]);
  // under each root: its 3-digit items (or the 2-digit ones that have no items), as in the demo
  const items = (r: AccountNode) => r.children.flatMap((k) => (k.code.length === 2 && k.children.length ? k.children : [k]));
  const line = (r: AccountNode) => {
    const subs = r.children.length ? leaves(r) : [];
    return subs.length ? (
      <details key={r.id} className="bs-acct"><summary className="acct"><span className="spacer"><span className="mono hint">{r.code}</span> {r.name} <span className="hint">({subs.length} حساب فرعي)</span></span><b className="num">{money(r.balance)}</b></summary>
        {subs.map((x) => <div key={x.id} className="acct sub click" onClick={() => setLedger(x.id)}><span className="spacer"><span className="mono hint">{x.code}</span> {x.name} <span className="hint"><Icon name="search" /></span></span><span className="num">{money(x.balance)}</span></div>)}
      </details>
    ) : <div key={r.id} className="acct click" onClick={() => setLedger(r.id)}><span className="spacer"><span className="mono hint">{r.code}</span> {r.name} <span className="hint"><Icon name="search" /></span></span><b className="num">{money(r.balance)}</b></div>;
  };
  return (
    <>
      <p className="hint">الميزانية العمومية · من شجرة الحسابات · افتح أي بند تشوف حساباته الفرعية، ودوس على أي حساب تشوف رصيده جه منين</p>
      <div className="cols">
        {roots.filter((r) => ["1", "2", "3"].includes(r.code)).map((r) => (
          <Card key={r.id} title={`${r.code} · ${r.name}`} icon="layers" extra={<Chip tone="acc">{money(r.balance)}</Chip>}>{items(r).map(line)}</Card>
        ))}
      </div>
      <Note kind={check.balanced ? "ok" : "warn"}>الأصول ({short(check.assets)}) = الخصوم ({short(check.liabilities)}) + حقوق الملكية ({short(check.equity)}) {check.balanced ? "✓" : "· فيه فرق"}</Note>
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
