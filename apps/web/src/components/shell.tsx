"use client";
/**
 * The signed-in layout from the demo (index.html + app.js render + mobile.js): navy side menu filtered by the
 * person's permissions, top bar with the page title and the bell; on phones a bottom tab bar and «المزيد».
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { NAV, SECTIONS, type NavKey } from "@/lib/nav";
import { LanguageSwitch } from "./language-switch";
import { Avatar, Icon } from "./ui";
import { BellPanel, useBell } from "./bell";
import { pushSubscription } from "@/features/notifications/push";

const BrandMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32"><path d="M8 25V7h9a6 6 0 0 1 0 12h-9" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="24" r="2.6" fill="currentColor" /></svg>
  </span>
);
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { me, can } = useMe();
  const t = useTranslations("common.shell");
  const tNav = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const bell = useBell();
  useEffect(() => setMenuOpen(false), [path]);
  // mobile.css keys the bottom tab bar off the body class, as in the demo
  useEffect(() => { document.body.classList.add("has-tabbar"); return () => document.body.classList.remove("has-tabbar"); }, []);

  async function signOut() {
    // 12.10: a shared phone must stop getting this person's notifications. The API drops the device's push with the
    // session; the browser forgets it too. Never blocks signing out.
    const sub = await pushSubscription().catch(() => null);
    await api.post("/auth/logout", sub ? { endpoint: sub.endpoint } : {}).catch(() => {});
    await sub?.unsubscribe().catch(() => false);
    qc.clear();
    router.replace("/login");
  }

  const keys = (Object.keys(NAV) as NavKey[]).filter((k) => can(k)).sort((a, b) => SECTIONS.indexOf(NAV[a].section) - SECTIONS.indexOf(NAV[b].section));
  const current = path.split("/")[1] || "home";
  const nav = current in NAV ? NAV[current as NavKey] : null;
  const label = (k: NavKey) => tNav(`modules.${k}.label`);
  const page = current === "profile" ? { label: t("myAccount"), code: "Account", icon: "id" as const, section: "", sub: t("myAccountSub") }
    : nav && { label: label(current as NavKey), code: nav.code, icon: nav.icon, section: nav.section ? tNav(`sections.${nav.section}`) : "", sub: tNav(`modules.${current as NavKey}.sub`) };
  let sec: string | null = null;

  return (
    <div className="app">
      <aside className={`side ${menuOpen ? "open" : ""}`} aria-label={t("mainMenu")}>
        <div className="brand"><BrandMark /><div className="brand-txt"><strong>Places ERP</strong><small>BY RECA TECH</small></div></div>
        <nav id="nav" aria-label={t("sections")}>
          {keys.map((k) => {
            const n = NAV[k];
            const head = n.section && n.section !== sec ? <div className="nav-sec">{tNav(`sections.${n.section}`)}</div> : null;
            sec = n.section || sec;
            const href = k === "home" ? "/" : `/${k}`;
            return (
              <div key={k} style={{ display: "contents" }}>
                {head}
                <Link href={href} aria-current={k === current ? "page" : undefined}><Icon name={n.icon} /><span className="lbl">{label(k)}</span><span className="tag">{n.code}</span></Link>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          {me && (
            <div className="me-card">
              <Link href="/profile" className="me-link" title={t("myAccount")}><Avatar id={me.id} name={me.name} /><div><b>{me.name}</b><small>{me.roleLabels.join(" + ")}</small></div></Link>
              <button className="icon-btn" onClick={signOut} aria-label={t("signOut")} title={t("signOut")}><Icon name="x" /></button>
            </div>
          )}
        </div>
      </aside>
      <div className="side-scrim" hidden={!menuOpen} onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="top">
          <button className="round menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label={t("openMenu")}><svg className="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg></button>
          {page && <span className="page-ico" aria-hidden="true"><Icon name={page.icon} /></span>}
          <div className="top-title">
            <nav className="bc" aria-label={t("youAreHere")}><Link href="/">Places</Link>{page?.section && <><span>›</span><span>{page.section}</span></>}<span>›</span><b>{page?.label}</b></nav>
            <div className="title-row"><h1>{page?.label ?? ""}</h1><span className="crumb">{page?.code}</span></div>
            {page?.sub && <p>{page.sub}</p>}
          </div>
          <div className="top-actions">
            {/* always in sight, next to the bell (not at the end of a scrolling menu) */}
            <LanguageSwitch className="round lang-btn" />
            <button className="round" onClick={() => void bell.openBell()} aria-label={bell.unread ? t("notificationsUnread", { count: bell.unread }) : t("notifications")}>
              <Icon name="bell" />{bell.unread > 0 && <b>{bell.unread}</b>}
            </button>
          </div>
        </header>
        {/* keyed by page so theme.css replays its «drawing» entrance on every navigation, as in the demo */}
        <main id="view" key={path} className="view enter" tabIndex={-1}>{children}</main>
      </div>

      {bell.open && <BellPanel bell={bell} />}

      <nav className="tabbar" aria-label={t("quickNav")}>
        {keys.slice(0, 4).map((k) => (
          <Link key={k} href={k === "home" ? "/" : `/${k}`} className={`tb ${k === current ? "on" : ""}`} aria-current={k === current ? "page" : "false"}>
            <Icon name={NAV[k].icon} /><span>{tNav(`modules.${k}.short`)}</span>
          </Link>
        ))}
        <button className={`tb ${!keys.slice(0, 4).includes(current as NavKey) ? "on" : ""}`} onClick={() => setMenuOpen(true)}><Icon name="list" /><span>{t("more")}</span></button>
      </nav>
    </div>
  );
}
