"use client";
import { useState } from "react";
import type { MoveEffect, MoveView } from "@places/contracts";
import { Chip, Empty, Icon, Note, Table } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { useMe } from "@/lib/me";
import { money, short } from "@/lib/format";
import { KIND, useCash, useMoves, type MoveKind } from "./use-finance";
import { MoveForm } from "./move-form";
import { Voucher, VoucherById } from "./voucher";
import { LedgerModal } from "./ledger-modal";

const KIND_LABEL: Record<string, string> = { treasury: "خزنة", bank: "بنك", wallet: "محفظة" };

/** M-07 · «الخزن والحركات» (9.2 · 9.11): balances, today's moves, the vouchers, and every move with its voucher. */
export function Cash() {
  const { can } = useMe();
  const cash = useCash();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const moves = useMoves(filter, page);
  const [form, setForm] = useState<MoveKind | null>(null);
  const [saved, setSaved] = useState<{ move: MoveView; effect: MoveEffect[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [statement, setStatement] = useState<string | null>(null);
  if (!cash.data) return <Empty text="بيحمّل…" icon="clock" />;
  const c = cash.data, canPost = can("finance", "create");
  const total = c.accounts.reduce((s, a) => s + Number(a.balance), 0);
  const btn = (k: MoveKind, icon: Parameters<typeof Icon>[0]["name"], ghost = true) => <button className={`btn ${ghost ? "ghost" : ""}`} onClick={() => setForm(k)}><Icon name={icon} />{KIND[k][0]}</button>;
  const m = moves.data;
  return (
    <>
      <div className="kpis">
        <KpiTile label="الخزن والبنوك" value={money(total.toFixed(2))} sub={`${c.accounts.length} حساب`} icon="bank" />
        <KpiTile label="حركات النهارده" value={c.today.count} sub={`صرف ${short(c.today.paid)} · قبض ${short(c.today.received)}`} icon="list" />
        <KpiTile label="عهد مفتوحة" value={money(c.custody.reduce((s, h) => s + Number(h.balance), 0).toFixed(2))} sub={`${c.custody.filter((h) => Number(h.balance)).length} شخص`} icon="wallet" tone="warn" />
        <KpiTile label="سلف الموظفين" value={money(c.advances.reduce((s, h) => s + Number(h.balance), 0).toFixed(2))} sub="بتتخصم من المرتب" icon="users" />
      </div>
      {canPost && <div className="row">{btn("pay", "send", false)}{btn("receive", "wallet")}{btn("transfer", "swap")}{btn("advance", "users")}{btn("custody", "wallet")}</div>}
      <Note>كل إذن بيعمل قيد يومية لوحده وبيغيّر أرصدة الشجرة على طول. مفيش صرف أكبر من رصيد الخزنة. دوس على أي خزنة تشوف كشف حسابها.</Note>
      <div className="kpis sm">
        {c.accounts.map((a) => <KpiTile key={a.id} label={`${a.code} · ${a.name}`} value={money(a.balance)} sub={KIND_LABEL[a.kind] ?? a.kind} icon={a.kind === "treasury" ? "wallet" : "bank"} onClick={() => setStatement(a.id)} />)}
      </div>
      <div className="row">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label="فلتر الخزنة">
          <option value="">كل الخزن</option>{c.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {m && <Table head={["الحركة", "التاريخ", "النوع", "من ← لـ", "الطرف", "البيان", "المبلغ"]} empty="مفيش حركات" onRow={(i) => setOpen(m.items[i]!.id)}
        rows={m.items.map((x) => [<span key="n" className="mono">{x.no}</span>, x.date, <Chip key="k" tone={KIND[x.kind as MoveKind]?.[1] ?? ""}>{x.label}</Chip>,
          `${x.from?.name ?? "—"}${x.to ? ` ← ${x.to.name}` : ""}`, x.party, x.memo, money(x.amount)])} />}
      {m && m.total > m.pageSize && (
        <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span className="hint">{page} من {Math.ceil(m.total / m.pageSize)}</span><button className="btn ghost sm" disabled={page * m.pageSize >= m.total} onClick={() => setPage(page + 1)}>اللي بعده</button></div>
      )}
      {form && <MoveForm kind={form} cash={c} onClose={() => setForm(null)} onSaved={(s) => { setForm(null); setSaved(s); }} />}
      {saved && <Voucher move={saved.move} effect={saved.effect} onClose={() => setSaved(null)} />}
      {open && <VoucherById id={open} onClose={() => setOpen(null)} />}
      {statement && <LedgerModal id={statement} onClose={() => setStatement(null)} />}
    </>
  );
}
