"use client";
import { useState, type ReactNode } from "react";
import type { UnitDetail } from "@places/contracts";
import { Drawer } from "@/components/blocks";
import { Chip, Empty, Note, Tabs } from "@/components/ui";
import { CloseRequests } from "./close-requests";
import { UnitPhotos } from "./unit-photos";
import { UnitPdfTab } from "./unit-pdf-tab";
import { amount, moneyExact, num } from "@/lib/format";
import { COLS, UnitChips, cell, columnsFor } from "./unit-bits";

const hours = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * The demo's unit drawer. «البيانات»: the type's columns, how the total (or Income's yield) is worked out, the photos
 * and when it came in. «PDF & slide» (2.8): the documents and Manar's confirm. The tasks and map tabs come with their
 * tasks. Prev / next walk the list.
 */
export function UnitDrawer({ ids, id, insider, editable, canConfirm, unit, error, onGo, onClose, onComplete, actions }: {
  ids: string[]; id: string; insider: boolean; editable: boolean; canConfirm: boolean; unit: UnitDetail | undefined; error: Error | null;
  onGo: (id: string) => void; onClose: () => void; onComplete?: () => void; actions?: ReactNode;
}) {
  const [tab, setTab] = useState<"data" | "pdf">("data");
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  if (error) return <Drawer title="الوحدة مش موجودة" onClose={onClose}><Empty text={error.message} /></Drawer>;
  if (!unit) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  const u = unit;
  const entered = u.receivedAt ? hours(u.receivedAt, u.enteredAt) : null;
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
      <Tabs value={tab} onChange={setTab} items={[["data", "البيانات"], ["pdf", "PDF & slide"]]} />
      {tab === "pdf" ? <UnitPdfTab u={u} canConfirm={canConfirm} /> : <>
      <CloseRequests unit={u} />
      {u.missing.length > 0 && <Note kind="warn"><b>بيانات ناقصة ({u.missing.length}):</b> {u.missing.join("، ")}. الوحدة اتسجّلت عادي، وفيه تنبيه في «مهامي النهارده» لحد ما تتكمّل.{" "}
        {onComplete && <button className="btn sm" onClick={onComplete}>كمّل البيانات</button>}</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {u.type === "Income" && u.income
        ? <Note>Monthly = Lease/m × Area = {moneyExact(u.income.monthlyRent)} · Annual = ×12 = {moneyExact(u.income.annualRent)} · Yield = Annual ÷ Sale total = <b>{u.income.yieldPct != null ? `${u.income.yieldPct.toFixed(2)}%` : "—"}</b></Note>
        : u.pricePerSqm && <Note>Total price = السعر للمتر × المساحة = {amount(u.pricePerSqm)} × {num(u.space)} = <b>{moneyExact(u.totalPrice)}</b></Note>}
      <UnitPhotos unitId={u.id} editable={editable} />
      {u.divisible && <Note>تنفع تتقسم{u.minSplit ? ` · أقل مساحة ${num(u.minSplit)} م` : ""}{u.splitNote ? ` · ${u.splitNote}` : ""}</Note>}
      <section className="card flat">
        <div className="row"><span className="hint">اتستلمت:</span><b>{when(u.receivedAt)}</b><span className="hint">اتدخلت:</span><b>{when(u.enteredAt)}</b>{entered != null && <Chip tone={entered <= 24 ? "ok" : "bad"}>{entered <= 24 ? "خلال 24 ساعة" : `بعد ${Math.round(entered)} ساعة`}</Chip>}</div>
        {/* 2.16 · Sara's KPI: the photos up within 24 hours of entering the unit (the demo's «الصور والـ PDF») */}
        <div className="row"><span className="hint">الصور والـ PDF:</span>{u.mediaUploadedAt
          ? <><b>{when(u.mediaUploadedAt)}</b><Chip tone={u.mediaOnTime ? "ok" : "bad"}>{u.mediaOnTime ? "اترفعت خلال 24 ساعة" : `اترفعت بعد ${Math.round(hours(u.enteredAt, u.mediaUploadedAt))} ساعة`}</Chip></>
          : <Chip tone="warn">لسه مااترفعتش</Chip>}</div>
        {u.createdBy && <p className="hint">دخّلها: {u.createdBy.name}</p>}
      </section>
      {actions}
      </>}
    </Drawer>
  );
}
