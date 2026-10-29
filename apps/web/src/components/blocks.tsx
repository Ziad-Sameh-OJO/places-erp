"use client";
/**
 * Bigger building blocks from the demo (demo/design-2/js/ui.js), with the demo's class names so packages/ui CSS styles
 * them as-is: Drawer (a bottom sheet on phones via mobile.css), Stepper, Kanban (drag a card to another lane),
 * KpiTile (with the decorative spark line) and Fab (the floating «جديد» on phones).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { IconName } from "@places/ui";
import { Icon } from "./ui";

/** Side panel for one record (lead, unit, deal…). Esc or the scrim closes it; prev/next buttons are optional. */
export function Drawer({ title, sub, chips, children, foot, onClose, onPrev, onNext, position }: {
  title: string; sub?: string; chips?: ReactNode; children: ReactNode; foot?: ReactNode; onClose: () => void;
  onPrev?: () => void; onNext?: () => void; position?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    requestAnimationFrame(() => setShown(true)); // .drawer.in slides it in
    ref.current?.focus();
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const initial = title.replace(/^(د\.|م\.|أ\.)\s*/, "").charAt(0);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer ${shown ? "in" : ""}`} aria-label={title} tabIndex={-1} ref={ref}>
        <header className="dr-head">
          <div className="dr-av" aria-hidden="true">{initial}</div>
          <div>
            {sub && <span className="crumb">{sub}</span>}
            <h2>{title}</h2>
            {chips && <div className="row">{chips}</div>}
          </div>
          <div className="dr-tools">
            {(onPrev || onNext) && (
              <span className="dr-nav">
                <button className="round" onClick={onPrev} disabled={!onPrev} aria-label="السابق">›</button>
                {position}
                <button className="round" onClick={onNext} disabled={!onNext} aria-label="التالي">‹</button>
              </span>
            )}
            <button className="round" onClick={onClose} aria-label="قفل"><Icon name="x" /></button>
          </div>
        </header>
        <div className="dr-body">{children}</div>
        {foot && <footer className="dr-foot">{foot}</footer>}
      </aside>
    </>
  );
}

/** Progress through ordered stages (a lead's pipeline). Everything before `current` is done. */
export function Stepper({ stages, current, done }: { stages: readonly string[]; current: string; done?: boolean }) {
  const at = stages.indexOf(current);
  return (
    <ol className="stepper">
      {stages.map((s, i) => (
        <li key={s} className={i < at || done ? "done" : i === at ? "cur" : ""} aria-current={i === at ? "step" : undefined}>
          <span>{i + 1}</span><b>{s}</b>
        </li>
      ))}
    </ol>
  );
}

export interface Lane<T> { key: string; title: string; tone?: string | undefined; items: T[] }

/**
 * Lanes of cards. Dragging a card onto another lane calls onMove(item, laneKey); the caller decides (and the API
 * checks) whether that move is allowed. Without onMove the board is read-only.
 */
export function Kanban<T>({ lanes, card, itemKey, onMove, empty = "—" }: {
  lanes: Lane<T>[]; card: (item: T) => ReactNode; itemKey: (item: T) => string; onMove?: (item: T, lane: string) => void; empty?: string;
}) {
  const [over, setOver] = useState<string | null>(null);
  const dragged = useRef<T | null>(null);
  return (
    <div className="board">
      {lanes.map((lane) => (
        <div key={lane.key} className={`lane l-${lane.key} ${over === lane.key ? "over" : ""}`}
          onDragOver={(e) => { if (onMove) { e.preventDefault(); setOver(lane.key); } }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => { e.preventDefault(); setOver(null); if (dragged.current && onMove) onMove(dragged.current, lane.key); dragged.current = null; }}>
          <h4><i style={lane.tone ? { background: `var(--${lane.tone})` } : undefined} />{lane.title}<span className="num">{lane.items.length}</span></h4>
          {lane.items.length ? lane.items.map((item) => (
            <div key={itemKey(item)} className="tcard" draggable={!!onMove}
              onDragStart={() => { dragged.current = item; }}>{card(item)}</div>
          )) : <p className="lane-empty">{empty}</p>}
        </div>
      ))}
    </div>
  );
}

/** Same stable decorative line as the demo (seeded by the label, so it doesn't jump between renders). */
function Spark({ seed, tone }: { seed: string; tone?: string | undefined }) {
  let h = 0;
  for (const c of seed) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const pts = Array.from({ length: 9 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return [i * 10.5, 26 - (5 + (h % 13) + i * 0.9)] as const; });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const col = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--accent)";
  return (
    <svg className="spark" viewBox="0 0 84 28" aria-hidden="true">
      <path d={`${d} L84 28 L0 28 Z`} fill={col} opacity=".12" />
      <path d={d} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A headline number. `delta` is the % change vs the previous period; with onClick the tile is a button. */
export function KpiTile({ label, value, sub, icon, tone, delta, onClick }: {
  label: string; value: ReactNode; sub?: string; icon?: IconName; tone?: "ok" | "warn" | "bad"; delta?: number | null; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="k-top"><span>{label}</span>{icon && <span className={`ico ${tone ?? ""}`}><Icon name={icon} /></span>}</div>
      <div className="k-val">
        <strong>{value}</strong>
        {delta != null && Number.isFinite(delta) && (
          <span className={`delta ${delta >= 0 ? "up" : "down"}`} title="مقارنة بالفترة اللي قبلها">{delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta))}%</span>
        )}
      </div>
      {sub && <small>{sub}</small>}
      <Spark seed={label} tone={tone} />
    </>
  );
  return onClick
    ? <button className="kpi kpi-btn" onClick={onClick}>{inner}</button>
    : <div className="kpi">{inner}</div>;
}

/** The floating «جديد» button; mobile.css shows it on phones only (desktop pages have their own button). */
export function Fab({ onClick, label = "جديد" }: { onClick: () => void; label?: string }) {
  return <button className="fab" onClick={onClick} aria-label={label}><Icon name="plus" /></button>;
}
