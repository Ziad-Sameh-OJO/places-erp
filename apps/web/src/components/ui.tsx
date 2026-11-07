"use client";
/**
 * The demo's building blocks (demo js/ui.js) as React components, with the same class names so app.css styles
 * them as-is: Icon, Chip, Card, Tabs, Table (cards on phones), Field, Note, Empty, Modal (bottom sheet on phones),
 * Tick, Avatar, and a toast.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Action, ModuleKey } from "@places/domain";
import type { ImportDone, ImportPreview } from "@places/contracts";
import { ICONS, type IconName } from "@places/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { useTranslations } from "next-intl";

export function Icon({ name }: { name: IconName }) {
  return <svg className="i" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

type Tone = "" | "ok" | "warn" | "bad" | "info" | "acc";
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
/** `onRow` makes rows clickable (the demo opens a record's drawer from its row); `className` goes on the wrapper («has-sheets»). */
/** Optional row checkboxes («حدد»): the ids of the rows in order, the picked ones, and the words for each box. */
export interface TablePick { ids: string[]; picked: string[]; onChange: (ids: string[]) => void; all: string; one: (index: number) => string }

export function Table({ head, rows, empty, onRow, className = "", pick }: { head: string[]; rows: ReactNode[][]; empty?: string; onRow?: (index: number) => void; className?: string; pick?: TablePick }) {
  const t = useTranslations("ui");
  const on = (id: string) => !!pick?.picked.includes(id);
  const all = !!pick && pick.ids.length > 0 && pick.ids.every(on);
  // toggling this page's rows keeps what was picked on other pages
  const flip = (ids: string[], add: boolean) => pick!.onChange(add ? [...new Set([...pick!.picked, ...ids])] : pick!.picked.filter((x) => !ids.includes(x)));
  return (
    <div className={`tbl-wrap ${className}`}>
      <table className="cardable">
        <thead><tr>
          {pick && <th className="pick"><input type="checkbox" checked={all} aria-label={pick.all} onChange={(e) => flip(pick.ids, e.target.checked)} /></th>}
          {head.map((h) => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => {
            const id = pick?.ids[i];
            return (
              <tr key={i} className={`${onRow ? "click" : ""} ${id && on(id) ? "selected" : ""}`} onClick={onRow ? () => onRow(i) : undefined}>
                {pick && id && <td className="pick" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={on(id)} aria-label={pick.one(i)} onChange={(e) => flip([id], e.target.checked)} /></td>}
                {r.map((c, j) => <td key={j} data-label={head[j]}>{c}</td>)}
              </tr>
            );
          })
            : <tr><td colSpan={head.length + (pick ? 1 : 0)}><Empty text={empty ?? t("table.empty")} /></td></tr>}
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

/** The demo's U.empty(text, icon): «sparkle» unless the screen picks one (a timeline's is «clock»). */
export const Empty = ({ text, icon = "sparkle" }: { text: string; icon?: IconName }) => <div className="empty"><Icon name={icon} /><p>{text}</p></div>;

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
  const t = useTranslations("ui");
  const ref = useRef<HTMLDivElement>(null);
  // once, when it opens: the first field (not the ✕ in the header, which comes first in the markup)
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(".modal-body input, .modal-body select, .modal-body textarea") ?? ref.current?.querySelector<HTMLElement>("button");
    first?.focus();
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  // Rendered on <body>: the design-2 entrance animation (transform, fill «both») turns the page's top-level cards into
  // the containing block of anything position:fixed inside them, which trapped a modal opened from a card in that card.
  return createPortal(
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label={t("close")}>✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type ToastTone = "ok" | "bad";
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, tone: ToastTone = "ok") => {
    setMsg({ text: serverText(text), tone }); // a server message in the reader's language
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  // alert for errors so a screen reader reads them at once (#210)
  return <ToastCtx.Provider value={show}>{children}<div className={`toast ${msg?.tone ?? ""}`} role={msg?.tone === "bad" ? "alert" : "status"} hidden={!msg}>{msg?.text}</div></ToastCtx.Provider>;
}

/**
 * For <form onSubmit>. React 19's <form action> clears every uncontrolled field once the action returns —
 * even when we caught an error and showed it — so a refused form came back empty. This keeps what was typed.
 */
export const onFormSubmit = (fn: (data: FormData) => unknown) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  void fn(new FormData(e.currentTarget));
};

/** Runs a change: the API's error (or anything thrown) shows as a toast, `ok` shows when it worked. */
export function useAction() {
  const toast = useToast();
  const t = useTranslations("ui");
  return useCallback(async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    try { await fn(); if (ok) toast(ok); }
    catch (e) { toast(e instanceof Error ? e.message : t("error"), "bad"); }
  }, [toast, t]);
}

/**
 * «تصدير Excel» for any table: sends the table's current filters to the module's export endpoint. Shown only to people
 * with the module's `export` permission (the API checks it again).
 */
export function ExportButton({ module, path, query, filename, label }: { module: ModuleKey; path: string; query?: URLSearchParams; filename: string; label?: string }) {
  const t = useTranslations("ui.export");
  const { can } = useMe();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  if (!can(module, "export" as Action)) return null;
  const qs = query ? `?${query}` : "";
  return (
    <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); await run(() => api.download(`${path}${qs}`, filename)); setBusy(false); }}>
      <Icon name="upload" />{busy ? t("busy") : label ?? t("label")}
    </button>
  );
}

/**
 * The shared Excel import: upload → preview (first 50 rows) → errors by line and column → «تأكيد». The API reads the
 * file again on confirm and saves nothing if it has errors. `path` serves `/template`, `/preview` and the import itself.
 */
/** `skipErrors` (13.1 old data): rows with errors and duplicates are skipped and counted instead of stopping the import. */
export function ImportDialog<T extends Record<string, unknown>>({ title, path, columns, template, onDone, onClose, skipErrors }: {
  title: string; path: string; columns: [keyof T & string, string][]; template: string; onDone: () => void; onClose: () => void; skipErrors?: boolean;
}) {
  const run = useAction();
  const toast = useToast();
  const t = useTranslations("ui.import");
  const [file, setFile] = useState<File | null>(null);
  const [p, setP] = useState<ImportPreview<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const step = async (fn: () => Promise<void>) => { setBusy(true); await run(fn); setBusy(false); };
  const pick = (f: File | undefined) => { setFile(f ?? null); setP(null); if (f) step(async () => setP(await api.upload<ImportPreview<T>>(`${path}/preview`, f))); };
  const confirm = () => step(async () => {
    const r = await api.upload<ImportDone>(path, file!);
    toast(r.duplicates !== undefined ? t("done", { imported: r.imported, duplicates: r.duplicates, skipped: r.skipped ?? 0 }) : t("imported", { imported: r.imported }));
    onDone();
  });
  return (
    <Modal title={title} onClose={onClose}>
      <div className="row">
        {/* the browser's own file field would say «Choose File» in English: an Arabic button opens it instead */}
        <label className="btn ghost">
          <Icon name="upload" />{file ? file.name : t("pick")}
          <input type="file" hidden accept=".xlsx,.csv" aria-label={t("fileLabel")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button type="button" className="btn ghost sm" onClick={() => run(() => api.download(`${path}/template`, template))}><Icon name="file" />{t("template")}</button>
      </div>
      <p className="hint">{t("columns", { columns: columns.map(([, h]) => h).join(t("columnSep")) })}</p>
      {busy && !p && <p className="hint">{t("reading")}</p>}
      {p && <>
        <div className="row"><Chip plain>{t("rows", { count: p.total })}</Chip><Chip tone="ok">{t(skipErrors ? "new" : "valid", { count: p.valid })}</Chip>{p.duplicates !== undefined && <Chip tone="warn">{t("duplicates", { count: p.duplicates })}</Chip>}{p.errors.length > 0 && <Chip tone="bad">{t("errors", { count: p.errors.length })}</Chip>}</div>
        {p.errors.length > 0 && <>
          <Note kind="warn">{skipErrors ? t("skipNote") : t("fixNote")}</Note>
          <Table head={[t("place"), t("column"), t("problem")]} rows={p.errors.slice(0, 100).map((e) => [t("line", { line: e.line }), e.column || "—", serverText(e.message)])} />
        </>}
        {p.sample.length > 0 && <Table head={columns.map(([, h]) => h)} rows={p.sample.map((r) => columns.map(([k]) => String(r[k] ?? "")))} />}
        {p.valid > p.sample.length && <p className="hint">{t("shown", { shown: p.sample.length, valid: p.valid })}</p>}
      </>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
        <button type="button" className="btn" disabled={!p || busy || (!skipErrors && p.errors.length > 0) || p.valid === 0} onClick={confirm}>{busy && p ? t("saving") : p?.valid && (skipErrors || !p.errors.length) ? t("confirmRows", { count: p.valid }) : t("confirm")}</button>
      </div>
    </Modal>
  );
}
