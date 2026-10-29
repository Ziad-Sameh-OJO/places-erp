"use client";
/**
 * The demo's building blocks (demo js/ui.js) as React components, with the same class names so app.css styles
 * them as-is: Icon, Chip, Card, Tabs, Table (cards on phones), Field, Note, Empty, Modal (bottom sheet on phones),
 * Tick, Avatar, and a toast.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ICONS, type IconName } from "@places/ui";

export function Icon({ name }: { name: IconName }) {
  return <svg className="i" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

type Tone = "" | "ok" | "warn" | "bad" | "info";
export const Chip = ({ tone = "", plain, children }: { tone?: Tone; plain?: boolean; children: ReactNode }) => (
  <span className={`chip ${tone} ${plain ? "plain" : ""}`}>{children}</span>
);

export function Card({ title, icon, sub, extra, children, className = "" }: { title?: string; icon?: IconName; sub?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h3>{icon && <span className="ico"><Icon name={icon} /></span>}<span>{title}{sub && <small>{sub}</small>}</span></h3>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tabs<K extends string>({ items, value, onChange }: { items: [K, string, (number | undefined)?][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, label, n]) => (
        <button key={k} role="tab" aria-selected={k === value} onClick={() => onChange(k)}>
          {label}{n != null && <> <span className="tab-n">{n}</span></>}
        </button>
      ))}
    </div>
  );
}

/** On phones every row becomes a card; each cell is labelled with its column (data-label, styled by mobile.css). */
export function Table({ head, rows, empty = "مفيش بيانات" }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="tbl-wrap">
      <table className="cardable">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={head[j]}>{c}</td>)}</tr>)
            : <tr><td colSpan={head.length}><Empty text={empty} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export const Field = ({ label, req, wide, children }: { label: string; req?: boolean; wide?: boolean; children: ReactNode }) => (
  <label className={`field ${req ? "req" : ""} ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>
);

export const Note = ({ kind, children }: { kind?: "warn" | "ok"; children: ReactNode }) => (
  <div className={`note ${kind ?? ""}`}><Icon name={kind === "warn" ? "alert" : kind === "ok" ? "check" : "info"} /><span className="spacer">{children}</span></div>
);

export const Empty = ({ text }: { text: string }) => <div className="empty"><Icon name="sparkle" /><p>{text}</p></div>;

/** A checkbox in the demo's style (the permission matrix, the notification rules). */
export const Tick = ({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void; label: string }) => (
  <label className="tick"><input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange?.(e.target.checked)} /><span /></label>
);

const AV = ["#0037ff", "#08875c", "#b06a00", "#c22a37", "#6a3df0", "#0a7f9e", "#2c5cff", "#b4479a"];
export function Avatar({ id, name, sm }: { id: string; name: string; sm?: boolean }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar ${sm ? "sm" : ""}`} style={{ background: AV[h % AV.length] }} aria-hidden="true">{name.replace(/^(د\.|م\.|أ\.)\s*/, "").charAt(0)}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="قفل">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const ToastCtx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3200);
  }, []);
  return <ToastCtx.Provider value={show}>{children}<div className="toast" role="status" hidden={!text}>{text}</div></ToastCtx.Provider>;
}

/** Runs a change: the API's error (or anything thrown) shows as a toast, `ok` shows when it worked. */
export function useAction() {
  const toast = useToast();
  return useCallback(async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    try { await fn(); if (ok) toast(ok); }
    catch (e) { toast(e instanceof Error ? e.message : "حصل خطأ"); }
  }, [toast]);
}
