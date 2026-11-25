"use client";
/**
 * The KPI card as it reads (redesign, 25 Nov): where the person stands (ring + the bands' scale), what it means in
 * money, where the score came from (one segment per item, as wide as its weight), then the items one per line.
 * Same data and actions as before (typing a manual number, «سلّمت»): only the layout changed.
 */
import { useState } from "react";
import type { KpiCardView, KpiItemView, KpiScale } from "@places/contracts";
import { Chip, Icon, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useFields } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { useTranslations } from "next-intl";
import { useRefreshKpis } from "./use-kpis";
import { type Period, PeriodSwitch } from "./kpis-page";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** The four bands of 11.4 as widths out of 100, lowest first. */
export const bandWidths = (s: KpiScale) => [s.low, s.partial - s.low, s.full - s.partial, 100 - s.full].map((w) => Math.max(0, w));
/** Which band a score is in: 0 (under «low») … 3 («full» and up). */
export const bandOf = (score: number, s: KpiScale) => (score < s.low ? 0 : score < s.partial ? 1 : score < s.full ? 2 : 3);
const BAND_TONE = ["bad", "warn", "ok2", "ok"] as const;

export function Ring({ pct, tone, label }: { pct: number; tone: string; label: string }) {
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className={`kx-ring ${tone}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="track" />
        <circle cx="60" cy="60" r={R} className="fill" strokeDasharray={`${(clamp(pct) / 100) * C} ${C}`} />
      </svg>
      <div><strong className="num">{Math.round(pct)}%</strong><small>{label}</small></div>
    </div>
  );
}

export function Scale({ score, scale }: { score: number; scale: KpiScale }) {
  const t = useTranslations("kpis.view");
  const w = bandWidths(scale), cols = w.map((x) => `${x}fr`).join(" ");
  const labels = [t("under", { v: scale.low }), `${scale.low}–${scale.partial}%`, `${scale.partial}–${scale.full}%`, `+${scale.full}%`];
  return (
    <div className="kx-scw">
      <div className="kx-scale" style={{ gridTemplateColumns: cols }}>
        {BAND_TONE.map((b) => <span key={b} className={b} />)}
        <u style={{ insetInlineStart: `${clamp(score)}%` }} />
      </div>
      <div className="kx-scale-l" style={{ gridTemplateColumns: cols }}>{labels.map((l, i) => <span key={i} className={bandOf(score, scale) === i ? "on" : ""}>{l}</span>)}</div>
    </div>
  );
}

/** Where the person stands, and what it means if the quarter closed today. */
export function Hero({ c, period, onPeriod }: { c: KpiCardView; period: Period; onPeriod: (p: Period) => void }) {
  const t = useTranslations("kpis");
  const s = period === "month" ? c.month : c;
  const next = [c.scale.low, c.scale.partial, c.scale.full].find((x) => s.score < x);
  return (
    <section className="kx-card kx-hero">
      <Ring pct={s.score} tone={s.tone} label={period === "month" ? t("view.thisMonth") : t("view.toDate")} />
      <div className="kx-mid">
        <div className="kx-h"><h2>{t("view.resultIn", { quarter: serverText(c.quarter.label) })}</h2><PeriodSwitch value={period} onChange={onPeriod} /></div>
        <p>
          {next == null ? t("view.atTop", { v: c.scale.full }) : t.rich("view.gap", { n: Math.ceil((next - s.score) * 10) / 10, v: next, b: (x) => <b className="num">{x}</b> })}
          {" · "}{t("followedBy", { name: c.follower.name })}{" · "}
          {c.approved ? <Chip tone="ok" plain>{t("card.approvedBy", { by: c.approved.by })}</Chip> : <Chip plain>{t("board.awaitingApproval")}</Chip>}
        </p>
        {period === "month" && <small className="hint">{t("period.monthNote")}</small>}
        <Scale score={s.score} scale={c.scale} />
      </div>
      <div className={`kx-money ${c.tone}`}><small>{t("view.ifClosedToday")}</small><strong>{serverText(c.tier)}</strong></div>
    </section>
  );
}

const achOf = (it: KpiItemView, period: Period) => (period === "month" && it.month ? it.month : it);

export function Stats({ c, period }: { c: KpiCardView; period: Period }) {
  const t = useTranslations("kpis.view");
  const below = c.items.filter((it) => achOf(it, period).achievement < 100), done = c.items.filter((it) => achOf(it, period).achievement >= 100);
  const sum = (xs: KpiItemView[], f: (it: KpiItemView) => number) => Math.round(xs.reduce((s, it) => s + f(it), 0) * 10) / 10;
  const manual = c.items.filter((it) => it.method === "manual").length;
  const tile = (n: number, tone: string, label: string, sub: string) => <div className="kx-stat"><strong className={`num ${tone}`}>{n}</strong><span><b>{label}</b>{sub}</span></div>;
  return (
    <div className="kx-strip">
      {tile(c.items.length, "", t("items"), t("weights", { n: sum(c.items, (it) => it.weight) }))}
      {tile(below.length, below.length ? "bad" : "", t("below"), t("belowWeight", { n: sum(below, (it) => it.weight) }))}
      {tile(done.length, done.length ? "ok" : "", t("done"), t("donePoints", { n: sum(done, (it) => achOf(it, period).contribution) }))}
      {tile(manual, "", t("manual"), t("manualSub"))}
    </div>
  );
}

type Filter = "all" | "below" | "done";
const HOW = { system: "info", report: "warn", manual: "" } as const;

/** «الـ N% جت منين؟» + the items. */
export function ItemsCard({ c, period }: { c: KpiCardView; period: Period }) {
  const t = useTranslations("kpis");
  const score = useFields("kpis").shows("score");
  const [f, setF] = useState<Filter>("all");
  const total = period === "month" ? c.month.score : c.score;
  const isBelow = (it: KpiItemView) => achOf(it, period).achievement < 100;
  const n = { all: c.items.length, below: c.items.filter(isBelow).length, done: c.items.filter((it) => !isBelow(it)).length };
  const shown = c.items.filter((it) => f === "all" || (f === "below") === isBelow(it));
  const sumW = c.items.reduce((s, it) => s + it.weight, 0);
  return (
    <section className="kx-card">
      {score && c.items.length > 0 && <>
        <div className="kx-h"><h3>{t("view.whereFrom", { n: Math.round(total) })}</h3><small className="hint">{t("view.stackHint")}</small></div>
        <div className="kx-stack" aria-hidden="true">{c.items.map((it) => <div key={it.id} style={{ flex: Math.max(it.weight, 1) }} title={`${serverText(it.title)} · ${it.weight}%`}><i style={{ width: `${clamp(achOf(it, period).achievement)}%` }} /></div>)}</div>
        <div className="kx-stack-l" aria-hidden="true">{c.items.map((it) => <span key={it.id} style={{ flex: Math.max(it.weight, 1) }}>{serverText(it.title)}</span>)}</div>
      </>}
      <div className="kx-h">
        <h3>{t("view.itemsTitle")}</h3>
        <div className="seg" role="group" aria-label={t("view.filter")}>
          {(["all", "below", "done"] as const).map((k) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{t(`view.f.${k}`)} <span className="num">{n[k]}</span></button>)}
        </div>
      </div>
      <div className="kx-items">
        <div className="kx-item hd"><span>{t("items.weight")}</span><span>{t("items.item")}</span><span>{t("items.target")}</span><span>{t("items.actual")}</span><span>{t("items.achievement")}</span><span>{t("items.inCard")}</span></div>
        {shown.map((it) => <ItemLine key={it.id} c={c} it={it} period={period} />)}
        {!shown.length && <p className="hint kx-none">{t("view.noneHere")}</p>}
        <div className="kx-item ft"><span /><b>{t("items.total")}</b><span /><span /><span className="num">{sumW}%</span><b className="num kx-c">{score ? `${total.toFixed(1)}%` : "—"}</b></div>
      </div>
    </section>
  );
}

function ItemLine({ c, it, period }: { c: KpiCardView; it: KpiItemView; period: Period }) {
  const t = useTranslations("kpis");
  const score = useFields("kpis").shows("score");
  // «الشهر»: the item's month figure, or its quarter one with a line saying so (manual items, whole-quarter %…)
  const m = period === "month" ? it.month : null, noMonth = period === "month" && !it.month;
  const actual = m
    ? (it.method === "report" ? t("items.deliveredOf", { n: m.value ?? 0, total: m.goal }) : m.value == null ? t("items.notYet") : String(m.value))
    : it.method === "report" ? t("items.deliveredOf", { n: it.delivered, total: it.required ?? 0 }) : it.value == null ? t("items.notYet") : String(it.value);
  const ach = m ? m.achievement : it.achievement, contribution = m ? m.contribution : it.contribution;
  const run = useAction(), refresh = useRefreshKpis();
  const [link, setLink] = useState<string | null>(null);
  const setValue = (v: string) => v !== "" && void run(async () => { await api.patch(`/kpis/cards/${c.id}/items/${it.id}/value`, { value: Number(v) }); await refresh(); }, t("items.valueSavedOk"));
  const deliver = () => void run(async () => { await api.post(`/kpis/cards/${c.id}/items/${it.id}/deliveries`, { link }); setLink(null); await refresh(); }, t("items.deliveredOk"));
  return (
    <div className={`kx-item ${ach < 100 ? "under" : ""}`}>
      <div className="kx-w num">{it.weight}%<small>{t("items.weight")}</small></div>
      <div className="kx-name">
        <b>{serverText(it.title)}</b>
        <small>{t("items.calc", { calc: serverText(it.calc) })}</small>
        {it.detail && <small><b>{serverText(it.detail)}</b></small>}
        {noMonth && <small>{t("period.noMonth")}</small>}
        {it.deliveries.length > 0 && <small>{t("items.deliveredOn", { days: it.deliveries.map((d) => day(d.at)).join(t("items.listSep")) })}</small>}
        <span className="kx-how"><Chip tone={HOW[it.method]} plain>{t(`how.${it.method}`)}</Chip>{it.module && <small className="mono">{it.module}</small>}</span>
      </div>
      <div className="kx-t" data-label={t("items.target")}>{serverText(it.targetText)}{m && it.method !== "report" && <small>{t("period.monthGoal", { goal: m.goal })}</small>}</div>
      <div className="kx-a" data-label={t("items.actual")}>
        {it.canEnter ? <input type="number" step="any" defaultValue={it.value ?? ""} aria-label={t("items.value")} onBlur={(e) => setValue(e.target.value)} /> : <span className={it.value == null && it.method !== "report" ? "hint" : ""}>{actual}</span>}
        {it.canDeliver && (link == null
          ? <button className="btn ghost sm" onClick={() => setLink("")}><Icon name="upload" />{t("items.delivered")}</button>
          : <span className="row"><input type="url" placeholder={t("items.fileLink")} value={link} onChange={(e) => setLink(e.target.value)} aria-label={t("items.deliveryLink")} /><button className="btn sm" onClick={deliver}>{t("items.deliver")}</button></span>)}
      </div>
      <div className={`kx-bar ${ach < 100 ? "under" : ""}`}>{score ? <><div><i style={{ width: `${clamp(ach)}%` }} /></div><b className="num">{Math.round(ach)}%</b></> : "—"}</div>
      <div className="kx-c num">{score ? <>{contribution.toFixed(1)}<small> {t("view.of", { n: it.weight })}</small></> : "—"}</div>
    </div>
  );
}
