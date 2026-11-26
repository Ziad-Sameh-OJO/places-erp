"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { Empty } from "@/components/ui";
import { NotifText } from "@/components/bell";
import { useTranslations } from "next-intl";

interface Notif { id: string; text: string; link: string | null; readAt: string | null; createdAt: string }

/** The same query as the bell in the top bar (its key and address with no type picked), so the home page adds no request. */
export const useMyNotifications = () =>
  useQuery({ queryKey: ["notifications", ""], queryFn: () => api.get<{ items: Notif[]; unread: number }>("/notifications?pageSize=30"), refetchInterval: 5 * 60_000 });

/** «آخر الإشعارات» on the home page (demo home.js): the latest seven, each opening what it's about. */
export function LatestNotifications() {
  const t = useTranslations("notifications.latest");
  const items = useMyNotifications().data?.items.slice(0, 7) ?? [];
  if (!items.length) return <Empty text={t("empty")} icon="bell" />;
  return <div className="timeline">{items.map((n) => <div key={n.id}><NotifText n={n} /><small>{ago(n.createdAt)}</small></div>)}</div>;
}
