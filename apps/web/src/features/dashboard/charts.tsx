"use client";
import { useId } from "react";
import Link from "next/link";
import type { AhmedDashboard, PacedBar, TrendPoint } from "@places/contracts";
import { fromDecimal } from "@places/domain";
import { dateLocale, num } from "@/lib/format";

/**
 * Ahmed's dashboard charts (design-lab «modern bento»): plain SVG and CSS, no chart library. Each chart has role="img"
 * and a sentence for screen readers; its numbers open the list behind them where one exists.
 */

/** A chart point's short label: «14» o'clock, «السبت» (a week's day), «16» (a month's day), «4/10» (a week from). */
export function pointLabel(p: { at?: string; from: string }, unit: "hour" | "day" | "week", weekdays = false): string {
  if (unit === "hour") return new Date(p.at ?? p.from).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" });
  const [, m, d] = p.from.split("-").map(Number) as [number, number, number];
  if (unit === "week") return `${d}/${m}`;
  return weekdays ? new Date(`${p.from}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: "short", timeZone: "UTC" }) : String(d);
}

/** A round top for the y axis (7 → 8, 23 → 25, 140 → 150) so the grid reads in whole numbers. */
const niceTop = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

/**
 * The new leads of the period (coral line and area) over the previous period (a faint dashed line). The SVG stretches
 * to the card ("0 0 100 100", strokes not scaled); one column a point on top of it, a link to the list of its days.
 */
export function TrendChart({ points, unit, label, tip, hrefOf }: {
  points: TrendPoint[]; unit: "hour" | "day" | "week"; label: string;
  tip: (p: TrendPoint, label: string) => string; hrefOf: (p: TrendPoint) => string;
}) {
  const id = useId(), n = points.length, weekdays = unit === "day" && n <= 7;
  const top = niceTop(Math.max(1, ...points.map((p) => Math.max(p.now ?? 0, p.before ?? 0))));
  const x = (i: number) => ((i + 0.5) / n) * 100, y = (v: number) => 100 - (v / top) * 100;
  const path = (vals: (number | null)[]) => vals.flatMap((v, i) => (v == null ? [] : [`${x(i).toFixed(2)},${y(v).toFixed(2)}`])).map((p, i) => `${i ? "L" : "M"}${p}`).join(" ");
  const cur = points.map((p) => p.now), last = cur.reduce<number>((k, v, i) => (v == null ? k : i), -1);
  const line = path(cur), area = last >= 0 ? `${line} L${x(last).toFixed(2)},100 L${x(0).toFixed(2)},100 Z` : "";
  const every = Math.ceil(n / (n > 14 ? 8 : 7)); // ~7 labels whatever the count
  return (
    <div className="trend">
      <div className="trend-y" aria-hidden>{[top, top / 2, 0].map((v) => <span key={v}>{num(v)}</span>)}</div>
      <div className="trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".24" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} className="grid" vectorEffect="non-scaling-stroke" />)}
          <path d={path(points.map((p) => p.before))} className="prev" vectorEffect="non-scaling-stroke" />
          {area && <path d={area} fill={`url(#${id})`} />}
          <path d={line} className="cur" vectorEffect="non-scaling-stroke" />
        </svg>
        {last >= 0 && <i className="trend-dot" style={{ left: `${x(last)}%`, top: `${y(cur[last]!)}%` }} />}
        <div className="trend-cols">
          {points.map((p, i) => {
            // a month's day says its month in the tooltip («4/11»), the axis has room for «4» only
            const text = tip(p, unit === "day" && !weekdays ? pointLabel(p, "week") : pointLabel(p, unit, weekdays)), side = i < n / 2 ? "start" : "end";
            return p.now == null
              ? <span key={p.at} className="tcol" />
              : <Link key={p.at} href={hrefOf(p)} className="tcol" aria-label={text}><span className={`tip ${side}`}>{text}</span></Link>;
          })}
        </div>
      </div>
      <div className="trend-x" aria-hidden>
        {points.map((p, i) => <span key={p.at}>{(i % every === 0 && n - 1 - i >= every / 2) || i === n - 1 ? pointLabel(p, unit, weekdays) : ""}</span>)}
      </div>
    </div>
  );
}

/** Collected (solid black) over the commission expected (hatched coral), a bar each day or week (design-lab «التحصيل»). */
export function MoneyBars({ c, label, tip }: { c: NonNullable<AhmedDashboard["collections"]>; label: string; tip: (p: { collected: string; expected: string }, label: string) => string }) {
  const vals = c.points.map((p) => ({ got: fromDecimal(p.collected), due: fromDecimal(p.expected) }));
  const top = Math.max(1, ...vals.map((v) => Math.max(v.got, v.due))), weekdays = c.unit === "day";
  return (
    <div className="mbars" role="img" aria-label={label} style={{ gridTemplateColumns: `repeat(${c.points.length}, minmax(0, 1fr))` }}>
      {c.points.map((p, i) => {
        const v = vals[i]!, name = pointLabel(p, c.unit, weekdays);
        return (
          <div key={p.from} className="mbar" title={tip(p, name)}>
            <div className="mbar-col">
              {v.due > 0 && <i className="exp" style={{ height: `${(Math.max(v.due, v.got) / top) * 100}%` }} />}
              {v.got > 0 && <i className="paid" style={{ height: `${(v.got / top) * 100}%` }} />}
            </div>
            <small>{name}</small>
          </div>
        );
      })}
    </div>
  );
}

const SLICES = ["var(--btn)", "var(--accent)", "var(--ink-3)", "var(--accent-line)", "var(--line-2)"];

/** The leads by channel: the top five and «the rest» around the total; each legend row opens the list of that channel. */
export function ChannelDonut({ rows, label, center, rest, hrefOf }: {
  rows: { channel: string; leads: number }[]; label: string; center: string; rest: string; hrefOf: (channel: string) => string;
}) {
  const total = rows.reduce((s, r) => s + r.leads, 0), R = 42, C = 2 * Math.PI * R;
  const shown = rows.slice(0, SLICES.length), other = rows.slice(SLICES.length).reduce((s, r) => s + r.leads, 0);
  const slices = [...shown.map((r, i) => ({ key: r.channel, name: r.channel, leads: r.leads, color: SLICES[i]!, href: hrefOf(r.channel) })),
    ...(other ? [{ key: "", name: rest, leads: other, color: "var(--sunken)", href: null }] : [])];
  let off = 0;
  return (
    <div className="donut-a">
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle r={R} cx="60" cy="60" className="trk" />
        {slices.map((s) => {
          const len = (s.leads / total) * C, el = (
            <circle key={s.key} r={R} cx="60" cy="60" stroke={s.color} strokeDasharray={`${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}`}
              strokeDashoffset={(-off).toFixed(2)} transform="rotate(-90 60 60)"><title>{`${s.name}: ${num(s.leads)}`}</title></circle>
          );
          off += len;
          return el;
        })}
        <text x="60" y="60" className="big">{num(total)}</text>
        <text x="60" y="76" className="sub">{center}</text>
      </svg>
      <ul>
        {slices.map((s) => {
          const body = <><i style={{ background: s.color }} /><span>{s.name}</span><b className="num">{num(s.leads)}</b><small>{Math.round((s.leads / total) * 100)}%</small></>;
          return <li key={s.key}>{s.href ? <Link href={s.href}>{body}</Link> : <span>{body}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

/**
 * The quarter's target as a half ring (design-lab «تارجت الربع»): black up to what's achieved (coral when behind the
 * pace), and a tick where «المفروض نكون هنا النهارده».
 */
export function Gauge({ bar, label, markTitle }: { bar: PacedBar; label: string; markTitle: string }) {
  const goal = fromDecimal(bar.goal), pct = bar.percent ?? 0;
  const mark = bar.expected ? Math.min(100, (fromDecimal(bar.expected) / goal) * 100) : null, behind = mark != null && pct < mark;
  const R = 52, C = Math.PI * R, at = (f: number, r: number) => [65 - r * Math.cos(Math.PI * f), 66 - r * Math.sin(Math.PI * f)] as const;
  const [x1, y1] = mark == null ? [0, 0] : at(mark / 100, 42), [x2, y2] = mark == null ? [0, 0] : at(mark / 100, 62);
  return (
    <svg viewBox="0 0 130 74" className={`gauge ${pct >= 100 ? "done" : behind ? "behind" : ""}`} role="img" aria-label={label}>
      <path d="M13 66 A52 52 0 0 1 117 66" className="trk" />
      {pct > 0 && <path d="M13 66 A52 52 0 0 1 117 66" className="val" strokeDasharray={`${((Math.min(100, pct) / 100) * C).toFixed(1)} ${C.toFixed(1)}`} />}
      {mark != null && <line x1={x1} y1={y1} x2={x2} y2={y2} className="mark"><title>{markTitle}</title></line>}
    </svg>
  );
}
