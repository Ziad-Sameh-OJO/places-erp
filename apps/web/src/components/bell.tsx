"use client";
/**
 * The bell (demo app.js «notif»), M-14 5.1 · 5.3 · 12.11: updates the moment a notification is written (the API's
 * event stream; the slow refresh is only the fallback), and filters by type and by «الجديد».
 */
import { type MouseEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { eventLabel } from "@places/domain";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { NAV } from "@/lib/nav";
import { dateLocale } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { Icon, Tabs, useToast } from "./ui";

interface Notif { id: string; text: string; link: string | null; important: boolean; event: string | null; readAt: string | null; createdAt: string }
interface Mine { items: Notif[]; unread: number; types: string[] }

/** Opens the bell from anywhere (the home's «إشعارات جديدة» tile), like openSearch for the search. */
const OPEN_BELL = "places:open-bell";
export const openBellPanel = () => window.dispatchEvent(new Event(OPEN_BELL));

/** The fallback refresh, for when the stream is down (a proxy cut it, the API restarted). */
const FALLBACK_REFRESH_MS = 5 * 60_000;

const ago = (iso: string, t: ReturnType<typeof useTranslations<"ui.bell">>) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? t("now") : m < 60 ? t("minutes", { count: m }) : m < 1440 ? t("hours", { count: Math.round(m / 60) }) : new Date(iso).toLocaleDateString(dateLocale());
};

/** A new notification for me → reload the bell. EventSource reconnects by itself. */
function useLiveNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/v1/notifications/stream", { withCredentials: true });
    es.addEventListener("notification", () => void qc.invalidateQueries({ queryKey: ["notifications"] }));
    return () => es.close();
  }, [qc]);
}

export function useBell() {
  const qc = useQueryClient();
  useLiveNotifications();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  // what was unread when the bell opened: opening marks everything read (demo), «الجديد» keeps showing those
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["notifications", type],
    queryFn: () => api.get<Mine>(`/notifications?pageSize=30${type ? `&event=${encodeURIComponent(type)}` : ""}`),
    refetchInterval: FALLBACK_REFRESH_MS,
  });
  const unread = q.data?.unread ?? 0;
  async function openBell() {
    setFresh(new Set((q.data?.items ?? []).filter((x) => !x.readAt).map((x) => x.id)));
    setOpen(true);
    // M-14 2.1 · 2.3: an important one stays unread until it's opened (or «قراءة كل الإشعارات»)
    if (unread) { await api.post("/notifications/seen"); void qc.invalidateQueries({ queryKey: ["notifications"] }); }
  }
  /** «قراءة كل الإشعارات» (client, 17 Nov): everything read now, and nothing left highlighted as new in the open panel. */
  async function readAll() {
    setFresh(new Set());
    if (unread) await api.post("/notifications/all/read");
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  useEffect(() => {
    const on = () => void openBell();
    window.addEventListener(OPEN_BELL, on);
    return () => window.removeEventListener(OPEN_BELL, on);
  });
  return { open, setOpen, openBell, readAll, unread, data: q.data, type, setType, fresh };
}

/**
 * A notification's words: a link when it leads to a page I may open (one event can reach people whose roles don't
 * open its page: HR on a lead's visit), and opening it reads it. A full load, as in the side menu's «فتحتها مؤخراً»:
 * the page reads «?open=» only on load, so /leads → /leads?open=… needs one.
 */
export function NotifText({ n, onOpen }: { n: Pick<Notif, "id" | "text" | "link" | "readAt">; onOpen?: () => void }) {
  const { opens } = useMe();
  const page = n.link?.split(/[/?]/)[1] || "home";
  if (!n.link || (page in NAV && !opens(page))) return <>{serverText(n.text)}</>;
  const link = n.link;
  const open = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // a new tab: the browser's own
    e.preventDefault();
    onOpen?.();
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    window.location.assign(link);
  };
  return <a href={link} onClick={(e) => void open(e)}>{serverText(n.text)}</a>;
}

export function BellPanel({ bell }: { bell: ReturnType<typeof useBell> }) {
  const t = useTranslations("ui.bell");
  const tUi = useTranslations("ui");
  const toast = useToast();
  const [only, setOnly] = useState<"all" | "new">("all");
  const items = (bell.data?.items ?? []).filter((x) => only === "all" || bell.fresh.has(x.id) || !x.readAt);
  return (
    <div className="panel" role="dialog" aria-label={t("title")}>
      <div className="panel-head"><strong>{t("title")}</strong>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn ghost sm" disabled={!bell.unread && bell.fresh.size === 0} onClick={() => void bell.readAll().then(() => toast(t("readAllDone")))}><Icon name="check" />{t("readAll")}</button>
          <button className="icon-btn" onClick={() => bell.setOpen(false)} aria-label={tUi("close")}>✕</button>
        </span>
      </div>
      <div className="row" style={{ padding: "0 12px 8px", gap: 8, flexWrap: "wrap" }}>
        <Tabs value={only} onChange={setOnly} items={[["all", t("all")], ["new", t("new")]]} />
        <select value={bell.type} onChange={(e) => bell.setType(e.target.value)} aria-label={t("type")} style={{ maxWidth: 200 }}>
          <option value="">{t("allTypes")}</option>
          {(bell.data?.types ?? []).map((k) => <option key={k} value={k}>{serverText(eventLabel(k))}</option>)}
        </select>
      </div>
      <div id="notifList">
        {items.length ? items.map((x) => (
          <div key={x.id} className={`ntf ${x.readAt && !bell.fresh.has(x.id) ? "" : "new"}`}>
            <NotifText n={x} onOpen={() => bell.setOpen(false)} />
            <small>{serverText(eventLabel(x.event))} · {ago(x.createdAt, t)}</small>
          </div>
        )) : <p className="empty">{t("empty")}</p>}
      </div>
    </div>
  );
}
