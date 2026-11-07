"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { MissingUnitsToday } from "@places/contracts";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import type { InboxLine } from "@/components/inbox";

/**
 * «مهامي النهارده» (2.20, demo home.js): a line for each of the first 5 units missing data with the columns' names
 * and «كمّل», and one line for the rest that opens the sheet on «ناقصها بيانات».
 */
export function useMissingUnitLines(enabled: boolean): InboxLine[] {
  const t = useTranslations("inventory.today");
  const data = useQuery({
    queryKey: ["units", "missing-today"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<MissingUnitsToday>("/home/inventory"),
  }).data;
  if (!data) return [];
  const lines: InboxLine[] = data.units.map((u) => ({
    key: `missing-${u.id}`, tone: "warn", icon: "alert", title: t("missing", { code: u.code, count: u.missing.length }),
    sub: u.missing.slice(0, 4).map(serverText).join(t("sep")) + (u.missing.length > 4 ? "…" : ""), href: `/inventory?unit=${u.id}`, button: t("complete"),
  }));
  const rest = data.total - data.units.length;
  if (rest > 0) lines.push({ key: "missing-rest", tone: "warn", icon: "alert", title: t("rest", { count: rest }), sub: t("restSub"), href: "/inventory?missing=1", button: t("open") });
  return lines;
}
