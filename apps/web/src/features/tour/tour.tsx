"use client";
/**
 * The guided tour (#580), the demo's «جولة سريعة للكلاينت» (shell.js showTour/stage/place): the page dims, one part is
 * lit, a card beside it explains it. Opened only from the «جولة سريعة» button. Arrows move (RTL: ← next), Esc ends.
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me";
import { TOUR, pageHref, type TourStep } from "./steps";

const OPEN = "places:tour";
/** Starts the tour from anywhere (the side menu's button). */
export const startTour = () => window.dispatchEvent(new Event(OPEN));

// on the screen: a phone's closed side menu is laid out but slid off it
const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== "hidden"; };
const target = (step: TourStep) => (step.sel ? [...document.querySelectorAll(step.sel)].find(shown) : undefined);
const isPhone = () => matchMedia("(max-width: 760px)").matches;
// phones: the card is docked at the bottom, so the part goes to the top, under the app bar
const bringIntoView = (el: Element) => { if (isPhone()) { el.scrollIntoView({ block: "start" }); scrollBy(0, -72); } else el.scrollIntoView({ block: "center" }); };

export function Tour() {
  const t = useTranslations("tour");
  const { opens } = useMe();
  const router = useRouter();
  const path = usePathname();
  const steps = useMemo(() => TOUR.filter((s) => opens(s.page)), [opens]);
  const [i, setI] = useState<number | null>(null);
  const hole = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const lit = useRef<Element | null>(null);
  const step = i === null ? null : steps[i];
  const current = useRef<TourStep | null>(null);
  current.current = step && pageHref(step.page) === path ? step : null;

  useEffect(() => { const on = () => setI(0); window.addEventListener(OPEN, on); return () => window.removeEventListener(OPEN, on); }, []);

  // the card sits beside a big highlight (a whole page) instead of covering it; on phones mobile.css docks it at the bottom
  const place = useCallback(() => {
    const h = hole.current, c = card.current, s = current.current;
    // the page re-renders while its data loads: a part that left the screen, or one that only now appeared, is found again
    if (s && (!lit.current?.isConnected || !shown(lit.current) || lit.current.id === "view")) lit.current = target(s) ?? document.getElementById("view");
    const el = lit.current;
    if (!h || !c) return;
    h.style.opacity = el ? "1" : "0"; // nothing lit while the next page loads
    if (!el) return;
    const now = el.getBoundingClientRect();
    if (now.bottom < 0 || now.top > innerHeight) bringIntoView(el); // content loaded above it pushed it away
    // clipped to the screen: a wide sheet scrolls sideways past it
    const b = el.getBoundingClientRect(), pad = 6, top = Math.max(b.top, 8), bot = Math.min(b.bottom, innerHeight - 8);
    const r = { top, bottom: bot, left: Math.max(b.left, 8), right: Math.min(b.right, innerWidth - 8), height: b.height, width: 0 };
    r.width = Math.max(0, r.right - r.left);
    Object.assign(h.style, { top: `${top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.max(0, bot - top) + pad * 2}px` });
    // phones dock the card at the bottom (mobile.css); a part down there (the + button, the tab bar) moves it to the top
    c.classList.toggle("up", isPhone() && r.top > innerHeight / 2);
    const big = r.height > innerHeight * 0.55, W = c.offsetWidth, H = c.offsetHeight;
    // under or over the part; a tall one (the menu, a whole page) gets the card beside it; no room anywhere: the bottom
    const centred = Math.min(Math.max(16, r.left + r.width / 2 - W / 2), innerWidth - W - 16), side = big ? innerHeight - H - 16 : top;
    let ct: number, cl: number;
    if (!big && bot + H + 32 < innerHeight) { ct = bot + 16; cl = centred; }
    else if (!big && top - H - 32 > 0) { ct = top - H - 16; cl = centred; }
    else if (r.left > W + 32) { cl = r.left - W - 16; ct = side; }
    else if (innerWidth - r.right > W + 32) { cl = r.right + 16; ct = side; }
    else { ct = innerHeight - H - 16; cl = centred; }
    c.style.top = `${Math.max(16, Math.min(innerHeight - H - 16, ct))}px`; c.style.left = `${cl}px`;
  }, []);

  // go to the step's page, wait for its part to render (data loads), bring it into view, then light it
  useEffect(() => {
    if (!step) return;
    const href = pageHref(step.page);
    if (path !== href) {
      // a fast «التالي» can let an earlier step's navigation land last: keep asking for this step's page
      lit.current = null; place(); router.push(href);
      const again = window.setInterval(() => router.push(href), 1500);
      return () => window.clearInterval(again);
    }
    let tries = 0, timer = 0;
    const find = () => {
      const found = target(step);
      if (!found && step.sel && tries++ < 25) { timer = window.setTimeout(find, 120); return; }
      const el = found ?? document.getElementById("view");
      if (!el) return;
      lit.current = el;
      bringIntoView(el);
      timer = window.setTimeout(place, 260);
    };
    timer = window.setTimeout(find, 80);
    return () => window.clearTimeout(timer);
  }, [step, path, router, place]);

  useEffect(() => {
    if (!step) return;
    const end = () => setI(null);
    const ltr = document.documentElement.dir === "ltr";
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof Element && e.target.closest("select"))) return;
      const move = { ArrowLeft: ltr ? -1 : 1, ArrowRight: ltr ? 1 : -1 }[e.key];
      if (e.key === "Escape") end();
      else if (move) setI((n) => (n === null ? n : n + move >= steps.length ? null : Math.max(0, n + move)));
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const follow = window.setInterval(place, 400); // data that loads late moves the part
    return () => { document.removeEventListener("keydown", key, true); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.clearInterval(follow); };
  }, [step, steps.length, place]);

  if (i === null || !step) return null;
  const sections = [...new Set(steps.map((s) => s.sec))];
  const last = i === steps.length - 1;
  return (
    <div className="tour">
      <div className="tour-hole" ref={hole} />
      <div className="tour-card" ref={card} role="dialog" aria-live="polite" aria-label={t("start")}>
        <div className="row">
          <span className="crumb">{t("progress", { sec: t(`sections.${step.sec}`), n: i + 1, total: steps.length })}</span>
          <span className="spacer" />
          <select aria-label={t("jump")} value={step.sec} onChange={(e) => setI(steps.findIndex((s) => s.sec === e.target.value))}>
            {sections.map((s) => <option key={s} value={s}>{t(`sections.${s}`)}</option>)}
          </select>
        </div>
        <div className="bar"><i style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <h3>{t(`steps.${step.key}.t`)}</h3>
        <p>{t(`steps.${step.key}.x`)}</p>
        <div className="row end">
          {i > 0 && <button type="button" className="btn ghost sm" onClick={() => setI(i - 1)}>{t("prev")}</button>}
          <button type="button" className="btn ghost sm" onClick={() => setI(null)}>{t("end")}</button>
          <button type="button" className="btn sm" onClick={() => setI(last ? null : i + 1)}>{last ? t("done") : t("next")}</button>
        </div>
      </div>
    </div>
  );
}
