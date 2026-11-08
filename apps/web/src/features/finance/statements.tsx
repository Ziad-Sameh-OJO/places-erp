"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { AccountNode, IncomeView, StatementLineView } from "@places/contracts";
import { Card, Chip, Empty, Icon, Modal, Note, Table } from "@/components/ui";
import { money, short } from "./money";
import { serverText } from "@/lib/server-text";
import { useChart, useIncome } from "./use-finance";
import { LedgerModal } from "./ledger-modal";

type Why = { title: string; rows: [string, string][]; total: [string, string]; path: string };

/**
 * 9.7 · قايمة الدخل (demo pnl()): «الشهر ده» or «من أول السنة», in Dr. Ali's stages. Every account line opens its
 * statement (where its balance came from); every total opens how it's computed and what it feeds into, up to net profit.
 */
export function IncomeStatement() {
  const t = useTranslations("finance");
  const [range, setRange] = useState<"month" | "year">("month");
  const q = useIncome(range);
  const [ledger, setLedger] = useState<string | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const s = q.data;
  const seg = (
    <div className="row">
      <div className="seg" role="group">
        <button aria-pressed={range === "month"} onClick={() => setRange("month")}>{t("pnl.thisMonth")}{s && range === "month" ? ` · ${serverText(s.label)}` : ""}</button>
        <button aria-pressed={range === "year"} onClick={() => setRange("year")}>{t("pnl.yearToDate")}</button>
      </div>
      <span className="hint spacer">{range === "month" ? t("pnl.monthHint") : t("pnl.yearHint")} · {t("pnl.clickHint")}</span>
    </div>
  );
  if (!s) return <>{seg}<Empty text={t("common.loading")} icon="clock" /></>;
  const show = (ls: StatementLineView[]) => ls.filter((l) => range === "year" || Number(l.value));
  const row = (label: string, value: string | number, cls: string, onClick: () => void, sign = 1): ReactNode => {
    const v = Number(value) * sign;
    return <tr key={label} className={`${cls} ${v < 0 ? "neg" : ""} click`} onClick={onClick}><td>{label} <span className="hint"><Icon name="search" /></span></td><td className="n">{money(value === "" ? "" : v.toFixed(2))}</td></tr>; // a hidden amount (M-09) comes blank
  };
  const name = (l: StatementLineView) => `${l.code} · ${serverText(l.name)}`;
  const leaf = (l: StatementLineView, sign: number) => row(name(l), l.value, "sub", () => setLedger(l.id), sign);
  const explain = (title: string, parts: [string, string][], total: string, path: string) => () => setWhy({ title, rows: parts, total: [title, total], path });
  const PATH = { rev: t("pnl.path.rev"), dir: t("pnl.path.dir"), sel: t("pnl.path.sel"), adm: t("pnl.path.adm"), oth: t("pnl.path.oth") };
  const sumOf = (ls: StatementLineView[]): [string, string][] => ls.filter((l) => Number(l.value)).map((l) => [name(l), l.value]);
  return (
    <>
      {seg}
      <div className="tbl-wrap pnl"><table><thead><tr><th>{t("common.item")}</th><th>{t("common.amount")}</th></tr></thead><tbody>
        {row(t("pnl.revenueRow"), s.revenue, "", explain(t("pnl.revenue"), sumOf(s.lines.revenue), s.revenue, PATH.rev))}{show(s.lines.revenue).map((l) => leaf(l, 1))}
        {row(t("pnl.directRow"), s.direct, "", explain(t("pnl.direct"), sumOf(s.lines.direct), s.direct, PATH.dir), -1)}{show(s.lines.direct).map((l) => leaf(l, -1))}
        {row(t("pnl.gross"), s.gross, "total", explain(t("pnl.gross"), [[t("pnl.revenue"), s.revenue], [t("pnl.lessDirect"), `-${s.direct}`]], s.gross, t("pnl.path.gross")))}
        {row(t("pnl.sellingRow"), s.selling, "", explain(t("pnl.selling"), sumOf(s.lines.selling), s.selling, PATH.sel), -1)}{show(s.lines.selling).map((l) => leaf(l, -1))}
        {row(t("pnl.contribution"), s.contribution, "total", explain(t("pnl.contribution"), [[t("pnl.gross"), s.gross], [t("pnl.lessSelling"), `-${s.selling}`]], s.contribution, t("pnl.path.contribution")))}
        {row(t("pnl.adminRow"), s.admin, "", explain(t("pnl.admin"), sumOf(s.lines.admin), s.admin, PATH.adm), -1)}{show(s.lines.admin).map((l) => leaf(l, -1))}
        {s.lines.other.map((o) => <OtherRows key={o.head.code} o={o} range={range} row={row} leaf={leaf} onWhy={explain(serverText(o.head.name), sumOf(o.lines.length ? o.lines : [o.head]), o.head.value, PATH.oth)} onLedger={() => setLedger(o.head.id)} />)}
        {row(t("pnl.net"), s.net, "total grand", explain(t("pnl.net"), [[t("pnl.contribution"), s.contribution], [t("pnl.lessAdmin"), `-${s.admin}`], [t("pnl.lessOther"), `-${s.other}`]], s.net, t("pnl.path.net")))}
      </tbody></table></div>
      <Note>{t("pnl.note")}</Note>
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
      {why && (
        <Modal title={why.title} onClose={() => setWhy(null)}>
          <Table head={[t("pnl.computedFrom"), t("common.amount")]} empty={t("pnl.emptyPeriod")} rows={[...why.rows.map(([l, v]) => [l, money(v)]), [<b key="t">{why.total[0]}</b>, <b key="v">{money(why.total[1])}</b>]]} />
          <p className="hint">{t("pnl.feedsInto", { path: why.path })}</p>
        </Modal>
      )}
    </>
  );
}

function OtherRows({ o, range, row, leaf, onWhy, onLedger }: { o: IncomeView["lines"]["other"][number]; range: string; row: (l: string, v: string, c: string, f: () => void, s?: number) => ReactNode; leaf: (l: StatementLineView, s: number) => ReactNode; onWhy: () => void; onLedger: () => void }) {
  const t = useTranslations("finance");
  if (range === "month" && !Number(o.head.value)) return null;
  return <>{row(t("pnl.less", { code: o.head.code, name: serverText(o.head.name) }), o.head.value, "", o.lines.length ? onWhy : onLedger, -1)}{o.lines.filter((l) => range === "year" || Number(l.value)).map((l) => leaf(l, -1))}</>;
}

/** 9.7 · الميزانية العمومية (demo bs()): assets, liabilities, equity; each item opens its sub-accounts, each account its statement. */
export function BalanceSheet() {
  const t = useTranslations("finance");
  const chart = useChart();
  const [ledger, setLedger] = useState<string | null>(null);
  if (!chart.data) return <Empty text={t("common.loading")} icon="clock" />;
  const { roots, check } = chart.data;
  const leaves = (n: AccountNode): AccountNode[] => (n.children.length ? n.children.flatMap(leaves) : [n]);
  // under each root: its 3-digit items (or the 2-digit ones that have no items), as in the demo
  const items = (r: AccountNode) => r.children.flatMap((k) => (k.code.length === 2 && k.children.length ? k.children : [k]));
  const line = (r: AccountNode) => {
    const subs = r.children.length ? leaves(r) : [];
    return subs.length ? (
      <details key={r.id} className="bs-acct"><summary className="acct"><span className="spacer"><span className="mono hint">{r.code}</span> {serverText(r.name)} <span className="hint">{t("bs.subs", { count: subs.length, n: String(subs.length) })}</span></span><b className="num">{money(r.balance)}</b></summary>
        {subs.map((x) => <div key={x.id} className="acct sub click" onClick={() => setLedger(x.id)}><span className="spacer"><span className="mono hint">{x.code}</span> {serverText(x.name)} <span className="hint"><Icon name="search" /></span></span><span className="num">{money(x.balance)}</span></div>)}
      </details>
    ) : <div key={r.id} className="acct click" onClick={() => setLedger(r.id)}><span className="spacer"><span className="mono hint">{r.code}</span> {serverText(r.name)} <span className="hint"><Icon name="search" /></span></span><b className="num">{money(r.balance)}</b></div>;
  };
  return (
    <>
      <p className="hint">{t("bs.hint")}</p>
      <div className="cols">
        {roots.filter((r) => ["1", "2", "3"].includes(r.code)).map((r) => (
          <Card key={r.id} title={`${r.code} · ${serverText(r.name)}`} icon="layers" extra={<Chip tone="acc">{money(r.balance)}</Chip>}>{items(r).map(line)}</Card>
        ))}
      </div>
      <Note kind={check.balanced ? "ok" : "warn"}>{t("bs.check", { assets: short(check.assets), liabilities: short(check.liabilities), equity: short(check.equity) })} {check.balanced ? "✓" : t("common.hasDiff")}</Note>
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
    </>
  );
}
