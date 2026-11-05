"use client";
import { useQuery } from "@tanstack/react-query";
import type { MissingUnitsToday } from "@places/contracts";
import { api } from "@/lib/api";
import type { InboxLine } from "@/components/inbox";

/**
 * «مهامي النهارده» (2.20, demo home.js): a line for each of the first 5 units missing data with the columns' names
 * and «كمّل», and one line for the rest that opens the sheet on «ناقصها بيانات».
 */
export function useMissingUnitLines(enabled: boolean): InboxLine[] {
  const data = useQuery({
    queryKey: ["units", "missing-today"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<MissingUnitsToday>("/home/inventory"),
  }).data;
  if (!data) return [];
  const lines: InboxLine[] = data.units.map((u) => ({
    key: `missing-${u.id}`, tone: "warn", icon: "alert", title: `${u.code} ناقصها ${u.missing.length} خانة`,
    sub: u.missing.slice(0, 4).join("، ") + (u.missing.length > 4 ? "…" : ""), href: `/inventory?unit=${u.id}`, button: "كمّل",
  }));
  const rest = data.total - data.units.length;
  if (rest > 0) lines.push({ key: "missing-rest", tone: "warn", icon: "alert", title: `${rest} وحدة تانية ناقصها بيانات`, sub: "افتح الشيت بفلتر «ناقصها بيانات»", href: "/inventory?missing=1", button: "افتح" });
  return lines;
}
