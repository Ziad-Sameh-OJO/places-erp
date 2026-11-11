"use client";
/**
 * 0.17 · «بحث سريع» (demo app.js cmdItems / renderCmd, index.html #cmd): ⌘K / Ctrl+K or «/» from any page, the
 * top bar's search pill, or the home page's button. Pages and «ليد جديد» on the screen; records from GET /search,
 * which answers within the person's scope and field permissions. ↑ ↓ to move, Enter to open, Esc to close.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { SearchHit, SearchKind, SearchResult } from "@places/contracts";
import type { IconName } from "@places/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { NAV, type NavKey } from "@/lib/nav";
import { RECENT } from "@/lib/quick";
import { num } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { Icon } from "./ui";

const OPEN_EVENT = "places:search";
/** Opens the search from anywhere (the home page's «بحث سريع»). */
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

const HIT: Record<SearchKind, { icon: IconName; href: (id: string) => string }> = {
  lead: RECENT.lead, unit: RECENT.unit, client: RECENT.client, deal: RECENT.deal, ticket: RECENT.ticket,
  employee: { icon: "id", href: (id) => `/hr?employee=${id}` },
};
interface Row { key: string; kind: string; label: string; sub: string; icon: IconName; href: string }

export function CommandPalette() {
  const t = useTranslations("common.search");
  const tNav = useTranslations("nav");
  const { can, opens } = useMe();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState(""); // what the API is asked, a moment after typing stops
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => { setOpen(true); setQ(""); setTyped(""); setSel(0); };
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable]");
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) { e.preventDefault(); show(); }
    };
    window.addEventListener(OPEN_EVENT, show);
    document.addEventListener("keydown", key);
    return () => { window.removeEventListener(OPEN_EVENT, show); document.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { const id = setTimeout(() => setTyped(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  useEffect(() => setOpen(false), [path]);

  const found = useQuery({
    queryKey: ["search", typed], enabled: open && typed.length >= 2,
    queryFn: () => api.get<SearchResult>(`/search?q=${encodeURIComponent(typed)}`),
  });
  const words = q.trim().toLowerCase();
  const pages: Row[] = (Object.keys(NAV) as NavKey[]).filter((k) => opens(k)).map((k) => ({
    key: `page:${k}`, kind: t("kinds.page"), label: tNav(`modules.${k}.label`), sub: NAV[k].code, icon: NAV[k].icon, href: k === "home" ? "/" : `/${k}`,
  }));
  const actions: Row[] = can("leads", "create") ? [{ key: "act:lead", kind: t("kinds.action"), label: t("newLead"), sub: "Create lead", icon: "plus", href: "/leads?new=1" }] : [];
  const hit = (h: SearchHit): Row => ({
    key: `${h.kind}:${h.id}`, kind: t(`kinds.${h.kind}`), label: h.label, icon: HIT[h.kind].icon, href: HIT[h.kind].href(h.id),
    sub: [...h.sub.map(serverText), ...(h.meters ? [t("meters", { n: num(h.meters) })] : [])].join(" · "),
  });
  const local = [...pages, ...actions].filter((r) => !words || `${r.label} ${r.sub}`.toLowerCase().includes(words));
  const rows = words ? [...local, ...(typed.length >= 2 ? found.data?.hits ?? [] : []).map(hit)] : local;
  const cur = Math.min(sel, Math.max(0, rows.length - 1));

  const go = (r: Row) => {
    setOpen(false);
    // a record on the page already on screen: load it again so the page reads «?open=» (as the side menu's «recent»)
    if (r.href.split("?")[0] === path && r.href.includes("?")) window.location.assign(r.href);
    else router.push(r.href);
  };
  if (!open) return null;
  return (
    <div className="cmd" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmd-box" role="dialog" aria-label={t("label")}>
        <div className="cmd-in">
          <Icon name="search" />
          <input ref={input} value={q} placeholder={t("placeholder")} autoComplete="off" aria-label={t("label")}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(rows.length - 1, cur + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(0, cur - 1)); }
              if (e.key === "Enter" && rows[cur]) { e.preventDefault(); go(rows[cur]); }
              if (e.key === "Escape") setOpen(false);
            }} />
        </div>
        <div className="cmd-list" role="listbox">
          {rows.length ? rows.map((r, i) => (
            <button key={r.key} className={`cmd-item ${i === cur ? "on" : ""}`} role="option" aria-selected={i === cur} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <Icon name={r.icon} /><span className="cmd-main"><b>{r.label}</b><small>{r.sub}</small></span><span className="chip plain">{r.kind}</span>
            </button>
          )) : <p className="empty">{found.isFetching || q.trim() !== typed ? t("searching") : t("none", { q: q.trim() })}</p>}
        </div>
        <div className="cmd-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t("move")}</span><span><kbd>Enter</kbd> {t("open")}</span><span><kbd>Esc</kbd> {t("close")}</span></div>
      </div>
    </div>
  );
}
