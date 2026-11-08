"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { UnitDetail } from "@places/contracts";
import { Drawer } from "@/components/blocks";
import { Chip, Empty, Note, Tabs } from "@/components/ui";
import { CloseRequests } from "./close-requests";
import { UnitFolder } from "./unit-photos";
import { UnitPdfTab } from "./unit-pdf-tab";
import { UnitLocationTab } from "./unit-map";
import { amount, dateLocale, moneyExact, num } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { COLS, UnitChips, cell, columnsFor } from "./unit-bits";
import { useFields } from "@/lib/me";

const hours = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(dateLocale(), { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * The demo's unit drawer. «البيانات»: the type's columns, how the total (or Income's yield) is worked out, the photos
 * and when it came in. «PDF & slide» (2.8): the documents and Manar's confirm. «الموقع» (2.26): the map, for whoever
 * sees the Location field (M-09). Prev / next walk the list.
 */
export function UnitDrawer({ ids, id, insider, canConfirm, unit, error, onGo, onClose, onComplete, actions }: {
  ids: string[]; id: string; insider: boolean; canConfirm: boolean; unit: UnitDetail | undefined; error: Error | null;
  onGo: (id: string) => void; onClose: () => void; onComplete?: () => void; actions?: ReactNode;
}) {
  const t = useTranslations("inventory");
  const fields = useFields("inventory");
  const [tab, setTab] = useState<"data" | "pdf" | "loc">("data");
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  if (error) return <Drawer title={t("drawer.notFound")} onClose={onClose}><Empty text={error.message} /></Drawer>;
  if (!unit) return <Drawer title="…" onClose={onClose}><p className="hint">{t("common.loading")}</p></Drawer>;
  const u = unit;
  const entered = u.receivedAt ? hours(u.receivedAt, u.enteredAt) : null;
  const cols = columnsFor(u.type, insider, t, fields.hidden).filter(([k]) => k !== "code");
  const kv: [string, ReactNode][] = [
    // the region (Income's «Area» column is the unit's size, as in its sheet)
    ...(COLS[u.type].some(([k]) => k === "area") || !fields.shows("area") ? [] : [[t("drawer.region"), u.area ? serverText(u.area) : "—"] as [string, ReactNode]]),
    ...cols.map(([k, label]) => [label, cell(u, k, t)] as [string, ReactNode]),
  ];
  return (
    <Drawer title={`${u.code} · ${u.project}`} sub={fields.shows("area") ? `${u.type} · ${serverText(u.area)}` : u.type} onClose={onClose} chips={<UnitChips u={u} />}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}>
      <Tabs value={tab} onChange={setTab} items={[["data", t("drawer.data")], ["pdf", "PDF & slide"], ...(fields.shows("location") ? [["loc", t("drawer.location")] as ["loc", string]] : [])]} />
      {tab === "loc" && <UnitLocationTab u={u} />}
      {tab === "pdf" ? <UnitPdfTab u={u} canConfirm={canConfirm} /> : tab === "loc" ? null : <>
      <CloseRequests unit={u} />
      {u.missing.length > 0 && <Note kind="warn"><b>{t("drawer.missingTitle", { count: u.missing.length })}</b> {u.missing.map(serverText).join(t("today.sep"))}{t("drawer.missingBody")}{" "}
        {onComplete && <button className="btn sm" onClick={onComplete}>{t("drawer.complete")}</button>}</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {u.type === "Income" && u.income
        ? <Note>Monthly = Lease/m × Area = {moneyExact(u.income.monthlyRent)} · Annual = ×12 = {moneyExact(u.income.annualRent)} · Yield = Annual ÷ Sale total = <b>{u.income.yieldPct != null ? `${u.income.yieldPct.toFixed(2)}%` : "—"}</b></Note>
        : u.pricePerSqm && <Note>{t("drawer.totalFormula", { price: amount(u.pricePerSqm), space: num(u.space) })}<b>{moneyExact(u.totalPrice)}</b></Note>}
      <div className="row"><UnitFolder u={u} /></div>
      {u.divisible && <Note>{t("list.divisible")}{u.minSplit ? ` · ${t("drawer.minSplit", { min: num(u.minSplit) })}` : ""}{u.splitNote ? ` · ${u.splitNote}` : ""}</Note>}
      <section className="card flat">
        <div className="row"><span className="hint">{t("drawer.received")}</span><b>{when(u.receivedAt)}</b><span className="hint">{t("drawer.entered")}</span><b>{when(u.enteredAt)}</b>{entered != null && <Chip tone={entered <= 24 ? "ok" : "bad"}>{entered <= 24 ? t("drawer.within24") : t("drawer.after", { hours: Math.round(entered) })}</Chip>}</div>
        {/* 2.16 · Sara's KPI: the photos up within 24 hours of entering the unit (the demo's «الصور والـ PDF») */}
        <div className="row"><span className="hint">{t("drawer.media")}</span>{u.mediaUploadedAt
          ? <><b>{when(u.mediaUploadedAt)}</b><Chip tone={u.mediaOnTime ? "ok" : "bad"}>{u.mediaOnTime ? t("drawer.mediaOnTime") : t("drawer.mediaLate", { hours: Math.round(hours(u.enteredAt, u.mediaUploadedAt)) })}</Chip></>
          : <Chip tone="warn">{t("drawer.mediaNone")}</Chip>}</div>
        {u.createdBy && <p className="hint">{t("drawer.enteredBy", { name: u.createdBy.name })}</p>}
      </section>
      {actions}
      </>}
    </Drawer>
  );
}
