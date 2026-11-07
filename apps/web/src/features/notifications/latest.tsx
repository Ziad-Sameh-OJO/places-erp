"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { Empty } from "@/components/ui";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

interface Notif { id: string; text: string; createdAt: string }

/** The same query as the bell in the top bar (same key), so the home page adds no request. */
export const useMyNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ items: Notif[]; unread: number }>("/notifications?pageSize=30"), refetchInterval: 60_000 });

/** «آخر الإشعارات» on the home page (demo home.js): the latest seven. */
export function LatestNotifications() {
  const t = useTranslations("notifications.latest");
  const items = useMyNotifications().data?.items.slice(0, 7) ?? [];
  if (!items.length) return <Empty text={t("empty")} icon="bell" />;
  return <div className="timeline">{items.map((n) => <div key={n.id}>{serverText(n.text)}<small>{ago(n.createdAt)}</small></div>)}</div>;
}
