"use client";
/**
 * The bell (demo app.js «notif»), M-14 5.1 · 5.3 · 12.11: updates the moment a notification is written (the API's
 * event stream; the slow refresh is only the fallback), and filters by type and by «الجديد».
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { eventLabel } from "@places/domain";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { Tabs } from "./ui";

interface Notif { id: string; text: string; link: string | null; important: boolean; event: string | null; readAt: string | null; createdAt: string }
interface Mine { items: Notif[]; unread: number; types: string[] }

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
    if (unread) { await api.post("/notifications/all/read"); void qc.invalidateQueries({ queryKey: ["notifications"] }); }
  }
  return { open, setOpen, openBell, unread, data: q.data, type, setType, fresh };
}

export function BellPanel({ bell }: { bell: ReturnType<typeof useBell> }) {
  const t = useTranslations("ui.bell");
  const tUi = useTranslations("ui");
  const [only, setOnly] = useState<"all" | "new">("all");
  const items = (bell.data?.items ?? []).filter((x) => only === "all" || bell.fresh.has(x.id) || !x.readAt);
  return (
    <div className="panel" role="dialog" aria-label={t("title")}>
      <div className="panel-head"><strong>{t("title")}</strong><button className="icon-btn" onClick={() => bell.setOpen(false)} aria-label={tUi("close")}>✕</button></div>
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
            {x.link ? <Link href={x.link} onClick={() => bell.setOpen(false)}>{serverText(x.text)}</Link> : serverText(x.text)}
            <small>{serverText(eventLabel(x.event))} · {ago(x.createdAt, t)}</small>
          </div>
        )) : <p className="empty">{t("empty")}</p>}
      </div>
    </div>
  );
}
