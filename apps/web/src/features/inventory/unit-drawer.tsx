"use client";
import type { ReactNode } from "react";
import type { UnitDetail } from "@places/contracts";
import { Drawer } from "@/components/blocks";
import { Empty, Note } from "@/components/ui";
import { CloseRequests } from "./close-requests";
import { amount, moneyExact, num } from "@/lib/format";
import { COLS, UnitChips, cell, columnsFor } from "./unit-bits";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * The demo's unit drawer, «البيانات» tab: the type's columns, how the total (or Income's yield) is worked out, and
 * when it came in. The PDF, tasks and map tabs come with their tasks (2.8 and after). Prev / next walk the list.
 */
export function UnitDrawer({ ids, id, insider, unit, error, onGo, onClose, actions }: {
  ids: string[]; id: string; insider: boolean; unit: UnitDetail | undefined; error: Error | null;
  onGo: (id: string) => void; onClose: () => void; actions?: ReactNode;
}) {
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  if (error) return <Drawer title="الوحدة مش موجودة" onClose={onClose}><Empty text={error.message} /></Drawer>;
  if (!unit) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  const u = unit;
  const cols = columnsFor(u.type, insider).filter(([k]) => k !== "code");
  const kv: [string, ReactNode][] = [
    // the region (Income's «Area» column is the unit's size, as in its sheet)
    ...(COLS[u.type].some(([k]) => k === "area") ? [] : [["المنطقة", u.area] as [string, ReactNode]]),
    ...cols.map(([k, label]) => [label, cell(u, k)] as [string, ReactNode]),
  ];
  return (
    <Drawer title={`${u.code} · ${u.project}`} sub={`${u.type} · ${u.area}`} onClose={onClose} chips={<UnitChips u={u} />}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}>
      <CloseRequests unit={u} />
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {u.type === "Income" && u.income
        ? <Note>Monthly = Lease/m × Area = {moneyExact(u.income.monthlyRent)} · Annual = ×12 = {moneyExact(u.income.annualRent)} · Yield = Annual ÷ Sale total = <b>{u.income.yieldPct != null ? `${u.income.yieldPct.toFixed(2)}%` : "—"}</b></Note>
        : u.pricePerSqm && <Note>Total price = السعر للمتر × المساحة = {amount(u.pricePerSqm)} × {num(u.space)} = <b>{moneyExact(u.totalPrice)}</b></Note>}
      {u.divisible && <Note>تنفع تتقسم{u.minSplit ? ` · أقل مساحة ${num(u.minSplit)} م` : ""}{u.splitNote ? ` · ${u.splitNote}` : ""}</Note>}
      <section className="card flat">
        <div className="row"><span className="hint">اتستلمت:</span><b>{when(u.receivedAt)}</b><span className="hint">اتدخلت:</span><b>{when(u.enteredAt)}</b></div>
        {u.createdBy && <p className="hint">دخّلها: {u.createdBy.name}</p>}
      </section>
      {actions}
    </Drawer>
  );
}
