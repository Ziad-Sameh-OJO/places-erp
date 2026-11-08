"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MoveEffect, MoveView } from "@places/contracts";
import { Chip, Empty, Icon, Note, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { useMe } from "@/lib/me";
import { money, short } from "./money";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { KIND, useCash, useMoves, type MoveKind } from "./use-finance";
import { MoveForm } from "./move-form";
import { Voucher, VoucherById } from "./voucher";
import { LedgerModal } from "./ledger-modal";
import { DueBillsCard } from "./bills";

const ACCOUNT_KINDS = ["treasury", "bank", "wallet"] as const;

/** M-07 · «الخزن والحركات» (9.2 · 9.11): balances, today's moves, the vouchers, and every move with its voucher. */
export function Cash() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const cash = useCash();
  const fields = useFields("finance");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const moves = useMoves(filter, page);
  const [form, setForm] = useState<MoveKind | null>(null);
  const [saved, setSaved] = useState<{ move: MoveView; effect: MoveEffect[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [statement, setStatement] = useState<string | null>(null);
  if (!cash.data) return <Empty text={t("common.loading")} icon="clock" />;
  // M-09: a hidden amount comes blank: no sums of it here either, and no vouchers without it
  const c = cash.data, canPost = can("finance", "create") && fields.edits("amount");
  const sum = (xs: { balance: string }[]) => (fields.shows("amount") ? xs.reduce((s, x) => s + Number(x.balance), 0).toFixed(2) : "");
  const holders = c.custody.filter((h) => Number(h.balance)).length;
  const kindLabel = (k: string) => ((ACCOUNT_KINDS as readonly string[]).includes(k) ? t(`accountKind.${k as (typeof ACCOUNT_KINDS)[number]}`) : k);
  const btn = (k: MoveKind, icon: Parameters<typeof Icon>[0]["name"], ghost = true) => <button className={`btn ${ghost ? "ghost" : ""}`} onClick={() => setForm(k)}><Icon name={icon} />{t(`kind.${k}`)}</button>;
  const m = moves.data;
  return (
    <>
      <DueBillsCard cash={c} />
      <div className="kpis">
        <KpiTile label={t("cash.safes")} value={money(sum(c.accounts))} sub={t("cash.accounts", { count: c.accounts.length, n: String(c.accounts.length) })} icon="bank" />
        <KpiTile label={t("cash.today")} value={c.today.count} sub={t("cash.todaySub", { paid: short(c.today.paid), received: short(c.today.received) })} icon="list" />
        <KpiTile label={t("cash.openCustody")} value={money(sum(c.custody))} sub={t("cash.people", { count: holders, n: String(holders) })} icon="wallet" tone="warn" />
        <KpiTile label={t("common.employeeAdvances")} value={money(sum(c.advances))} sub={t("cash.advancesSub")} icon="users" />
      </div>
      {canPost && <div className="row">{btn("pay", "send", false)}{btn("receive", "wallet")}{btn("transfer", "swap")}{btn("advance", "users")}{btn("custody", "wallet")}</div>}
      <Note>{t("cash.note")}</Note>
      <div className="kpis sm">
        {c.accounts.map((a) => <KpiTile key={a.id} label={`${a.code} · ${serverText(a.name)}`} value={money(a.balance)} sub={kindLabel(a.kind)} icon={a.kind === "treasury" ? "wallet" : "bank"} onClick={() => setStatement(a.id)} />)}
      </div>
      <div className="row">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label={t("cash.filter")}>
          <option value="">{t("cash.allSafes")}</option>{c.accounts.map((a) => <option key={a.id} value={a.id}>{serverText(a.name)}</option>)}
        </select>
      </div>
      {m && <Table head={[t("cash.move"), t("common.date"), t("cash.type"), t("cash.fromTo"), ...(fields.shows("party") ? [t("cash.party")] : []), ...(fields.shows("memo") ? [t("common.memo")] : []), ...(fields.shows("amount") ? [t("common.amount")] : [])]} empty={t("cash.empty")} onRow={(i) => setOpen(m.items[i]!.id)}
        rows={m.items.map((x) => [<span key="n" className="mono">{x.no}</span>, x.date, <Chip key="k" tone={KIND[x.kind as MoveKind] ?? ""}>{serverText(x.label)}</Chip>,
          `${x.from ? serverText(x.from.name) : "—"}${x.to ? `${t("common.pathSep")}${serverText(x.to.name)}` : ""}`,
          ...(fields.shows("party") ? [x.party] : []), ...(fields.shows("memo") ? [x.memo] : []), ...(fields.shows("amount") ? [money(x.amount)] : [])])} />}
      {m && m.total > m.pageSize && (
        <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</button><span className="hint">{t("common.pageOf", { page: String(page), pages: String(Math.ceil(m.total / m.pageSize)) })}</span><button className="btn ghost sm" disabled={page * m.pageSize >= m.total} onClick={() => setPage(page + 1)}>{t("common.next")}</button></div>
      )}
      {form && <MoveForm kind={form} cash={c} onClose={() => setForm(null)} onSaved={(s) => { setForm(null); setSaved(s); }} />}
      {saved && <Voucher move={saved.move} effect={saved.effect} onClose={() => setSaved(null)} />}
      {open && <VoucherById id={open} onClose={() => setOpen(null)} />}
      {statement && <LedgerModal id={statement} onClose={() => setStatement(null)} />}
    </>
  );
}
