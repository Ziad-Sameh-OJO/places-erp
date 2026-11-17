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
import { SUPER_ADMIN_ROLE } from "@places/domain";
import { LanguageSwitch } from "./language-switch";
import { Avatar, Icon, useToast } from "./ui";
import { RECENT, toggleFav, useQuick } from "@/lib/quick";
import { BellPanel, useBell } from "./bell";
import { CreateMenu } from "./create-menu";
import { CommandPalette, openSearch } from "./command-palette";
import { pushSubscription } from "@/features/notifications/push";

/** The Places wordmark (white on the black menu); «ERP» marks the system apart from the brand; under it, who built it, linking to their site (client, 16–17 Nov). */
const Brand = () => (
  <div className="brand">
    <div className="brand-row"><img className="brand-logo" src="/brand/places-logo-white.png" alt="Places" width={936} height={222} /><small>ERP</small></div>
    <a className="brand-by" dir="ltr" href="https://reca-tech.com" target="_blank" rel="noopener noreferrer">Developed By <b>RECA TECH</b></a>
  </div>
);
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { me, can, opens } = useMe();
  const t = useTranslations("common.shell");
  const tNav = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const bell = useBell();
  const toast = useToast();
  const quick = useQuick(me?.id);
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

  // a Super Admin's day starts on the company Dashboard, so it comes before «مهامي النهارده» in his menu (client, 17 Nov)
  const dashFirst = !!me?.roles.includes(SUPER_ADMIN_ROLE);
  const rank = (k: NavKey) => SECTIONS.indexOf(NAV[k].section) * 2 - (dashFirst && k === "dashboard" ? 1 : 0);
  const keys = (Object.keys(NAV) as NavKey[]).filter((k) => opens(k)).sort((a, b) => rank(a) - rank(b));
  const current = path.split("/")[1] || "home";
  const nav = current in NAV ? NAV[current as NavKey] : null;
  const label = (k: NavKey) => tNav(`modules.${k}.label`);
  const page = current === "profile" ? { label: t("myAccount"), code: "Account", icon: "id" as const, section: "", sub: t("myAccountSub") }
    : nav && { label: label(current as NavKey), code: nav.code, icon: nav.icon, section: nav.section ? tNav(`sections.${nav.section}`) : "", sub: tNav(`modules.${current as NavKey}.sub`) };
  let sec: string | null = null;
  // 0.14: only pages and records this person may still open
  const favs = quick.favs.filter((k): k is NavKey => k in NAV && opens(k));
  const recent = quick.recent.filter((r) => can(RECENT[r.kind].module));
  // «فتحتها مؤخراً» folds on a click (16 Nov), closed by default; the choice stays for this browser
  const [recentOpen, flipRecent] = useFold("places.recentOpen", false);
  const [favsOpen, flipFavs] = useFold("places.favsOpen", true);
  const starred = current in NAV && quick.favs.includes(current);
  const star = () => { if (me) toast(toggleFav(me.id, current) ? t("favAdded") : t("favRemoved")); };

  return (
    <div className="app">
      <aside className={`side ${menuOpen ? "open" : ""}`} aria-label={t("mainMenu")}>
        <Brand />
        <div className="side-quick">
          {recent.length > 0 && <><button type="button" className="nav-sec nav-toggle" aria-expanded={recentOpen} onClick={flipRecent}><Icon name="clock" />{t("recent")}<span className="caret" aria-hidden /></button>
            {/* a plain link: a full load, so the page reads «?open=» again even when it's the page already on screen */}
            {recentOpen && recent.map((r) => <a key={`${r.kind}:${r.id}`} className="q-item" href={RECENT[r.kind].href(r.id)}><Icon name={RECENT[r.kind].icon} /><span className="lbl">{r.label}</span><small className="tag">{t(`recentKind.${r.kind}`)}</small></a>)}</>}
          {/* «المفضلة» under «فتحتها مؤخراً» (client, 17 Nov): always there, so people learn the ☆ beside a page's title fills it */}
          <button type="button" className="nav-sec nav-toggle" aria-expanded={favsOpen} onClick={flipFavs}><Icon name="star" />{t("favs")}{favs.length > 0 && <small className="nav-n">{favs.length}</small>}<span className="caret" aria-hidden /></button>
          {favsOpen && (favs.length
            ? favs.map((k) => <Link key={k} className="q-item" href={k === "home" ? "/" : `/${k}`}><Icon name={NAV[k].icon} /><span className="lbl">{label(k)}</span></Link>)
            : <p className="q-hint">{t("favsEmpty")}</p>)}
        </div>
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
            <div className="title-row"><h1>{page?.label ?? ""}</h1>{current in NAV && <button className="fav-btn" aria-pressed={starred} title={starred ? t("favRemove") : t("favAdd")} aria-label={starred ? t("favRemove") : t("favAdd")} onClick={star}><Icon name="star" /></button>}<span className="crumb">{page?.code}</span></div>
            {page?.sub && <p>{page.sub}</p>}
          </div>
          <button className="search-pill" onClick={openSearch} aria-label={t("searchLabel")}><Icon name="search" /><span>{t("searchPill")}</span></button>
          <div className="top-actions">
            {me && <CreateMenu can={can} />}
            {/* always in sight, next to the bell (not at the end of a scrolling menu) */}
            <LanguageSwitch className="round lang-btn" />
            <button className="round" onClick={() => void bell.openBell()} aria-label={bell.unread ? t("notificationsUnread", { count: bell.unread }) : t("notifications")}>
              <Icon name="bell" />{bell.unread > 0 && <b>{bell.unread}</b>}
            </button>
          </div>
        </header>
        {/* keyed by page so modern.css replays its soft entrance on every navigation */}
        <main id="view" key={path} className="view enter" tabIndex={-1}>{children}</main>
      </div>

      {bell.open && <BellPanel bell={bell} />}
      <CommandPalette />

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

/** A menu section that opens and closes, remembered on this browser (a convenience: private mode just forgets it). */
function useFold(key: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(initial);
  useEffect(() => { try { const v = localStorage.getItem(key); if (v !== null) setOpen(v === "1"); } catch { /* not kept */ } }, [key]);
  const flip = () => setOpen((o) => { try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* not kept */ } return !o; });
  return [open, flip];
}
