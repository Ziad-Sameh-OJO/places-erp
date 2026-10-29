"use client";
/**
 * The signed-in layout from the demo (index.html + app.js render + mobile.js): navy side menu filtered by the
 * person's permissions, top bar with the page title and the bell; on phones a bottom tab bar and «المزيد».
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModuleKey } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { NAV, SECTIONS } from "@/lib/nav";
import { Avatar, Icon } from "./ui";

interface Notif { id: string; text: string; link: string | null; important: boolean; readAt: string | null; createdAt: string }
const BrandMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32"><path d="M8 25V7h9a6 6 0 0 1 0 12h-9" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="24" r="2.6" fill="currentColor" /></svg>
  </span>
);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} دقيقة` : m < 1440 ? `من ${Math.round(m / 60)} ساعة` : new Date(iso).toLocaleDateString("ar-EG");
};

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { me, can } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  // mobile.css keys the bottom tab bar off the body class, as in the demo
  useEffect(() => { document.body.classList.add("has-tabbar"); return () => document.body.classList.remove("has-tabbar"); }, []);

  const notifs = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ items: Notif[]; unread: number }>("/notifications?pageSize=30"), refetchInterval: 60_000 });
  const unread = notifs.data?.unread ?? 0;
  async function openBell() {
    setBellOpen(true);
    if (unread) { await api.post("/notifications/all/read"); qc.invalidateQueries({ queryKey: ["notifications"] }); }
  }
  async function signOut() {
    await api.post("/auth/logout").catch(() => {});
    qc.clear();
    router.replace("/login");
  }

  const keys = (Object.keys(NAV) as ModuleKey[]).filter((k) => can(k)).sort((a, b) => SECTIONS.indexOf(NAV[a]!.section) - SECTIONS.indexOf(NAV[b]!.section));
  const current = (path.split("/")[1] || "home") as ModuleKey;
  const page = current === ("profile" as ModuleKey) ? { label: "حسابي", code: "Account", icon: "id" as const, section: "", sub: "الباسورد والإشعارات بتاعتك" } : NAV[current];
  let sec: string | null = null;

  return (
    <div className="app">
      <aside className={`side ${menuOpen ? "open" : ""}`} aria-label="القايمة الرئيسية">
        <div className="brand"><BrandMark /><div className="brand-txt"><strong>Places ERP</strong><small>BY RECA TECH</small></div></div>
        <nav id="nav" aria-label="الأقسام">
          {keys.map((k) => {
            const n = NAV[k]!;
            const head = n.section && n.section !== sec ? <div className="nav-sec">{n.section}</div> : null;
            sec = n.section || sec;
            const href = k === "home" ? "/" : `/${k}`;
            return (
              <div key={k} style={{ display: "contents" }}>
                {head}
                <Link href={href} aria-current={k === current ? "page" : undefined}><Icon name={n.icon} /><span className="lbl">{n.label}</span><span className="tag">{n.code}</span></Link>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          {me && (
            <div className="me-card">
              <Link href="/profile" className="me-link" title="حسابي"><Avatar id={me.id} name={me.name} /><div><b>{me.name}</b><small>{me.roleLabels.join(" + ")}</small></div></Link>
              <button className="icon-btn" onClick={signOut} aria-label="خروج" title="خروج"><Icon name="x" /></button>
            </div>
          )}
        </div>
      </aside>
      <div className="side-scrim" hidden={!menuOpen} onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="top">
          <button className="round menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="افتح القايمة"><svg className="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg></button>
          {page && <span className="page-ico" aria-hidden="true"><Icon name={page.icon} /></span>}
          <div className="top-title">
            <nav className="bc" aria-label="مكانك"><Link href="/">Places</Link>{page?.section && <><span>›</span><span>{page.section}</span></>}<span>›</span><b>{page?.label}</b></nav>
            <div className="title-row"><h1>{page?.label ?? ""}</h1><span className="crumb">{page?.code}</span></div>
            {page?.sub && <p>{page.sub}</p>}
          </div>
          <div className="top-actions">
            <button className="round" onClick={openBell} aria-label={`الإشعارات${unread ? ` (${unread} جديد)` : ""}`}>
              <Icon name="bell" />{unread > 0 && <b>{unread}</b>}
            </button>
          </div>
        </header>
        {/* keyed by page so theme.css replays its «drawing» entrance on every navigation, as in the demo */}
        <main id="view" key={path} className="view enter" tabIndex={-1}>{children}</main>
      </div>

      {bellOpen && (
        <>
          <div className="panel" role="dialog" aria-label="الإشعارات">
            <div className="panel-head"><strong>الإشعارات</strong><button className="icon-btn" onClick={() => setBellOpen(false)} aria-label="قفل">✕</button></div>
            <div id="notifList">
              {notifs.data?.items.length ? notifs.data.items.map((x) => (
                <div key={x.id} className={`ntf ${x.readAt ? "" : "new"}`}>
                  {x.link ? <Link href={x.link} onClick={() => setBellOpen(false)}>{x.text}</Link> : x.text}<small>{ago(x.createdAt)}</small>
                </div>
              )) : <p className="empty">مفيش إشعارات</p>}
            </div>
          </div>
        </>
      )}

      <nav className="tabbar" aria-label="التنقل السريع">
        {keys.slice(0, 4).map((k) => (
          <Link key={k} href={k === "home" ? "/" : `/${k}`} className={`tb ${k === current ? "on" : ""}`} aria-current={k === current ? "page" : "false"}>
            <Icon name={NAV[k]!.icon} /><span>{NAV[k]!.short ?? NAV[k]!.label}</span>
          </Link>
        ))}
        <button className={`tb ${!keys.slice(0, 4).includes(current) ? "on" : ""}`} onClick={() => setMenuOpen(true)}><Icon name="list" /><span>المزيد</span></button>
      </nav>
    </div>
  );
}
