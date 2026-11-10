"use client";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { TodayKind, TodayLine } from "@places/contracts";
import type { IconName } from "@places/ui";
import { api } from "@/lib/api";
import { ago, day, dayTime, money } from "@/lib/format";
import type { InboxLine } from "@/components/inbox";

/**
 * 0.18 · «مهامي النهارده» from the modules' `GET /home/<module>` (demo home.js): the lines the API already scoped to
 * this person and to what they may do; here each kind gets the demo's icon, words and the screen it opens.
 */
const LOOK: Record<TodayKind, { icon: IconName; href: (id: string) => string }> = {
  task: { icon: "check", href: (id) => `/tasks?id=${id}` },
  retouch: { icon: "image", href: (id) => `/tasks?id=${id}` },
  ticket: { icon: "ticket", href: (id) => `/tickets?id=${id}` },
  dealReview: { icon: "handshake", href: (id) => `/deals?open=${id}` },
  dealSeller: { icon: "users", href: (id) => `/deals?open=${id}` },
  tcrSign: { icon: "file", href: (id) => `/deals?open=${id}` },
  contractEnding: { icon: "file", href: (id) => `/contracts?open=${id}` },
  purchaseApprove: { icon: "cart", href: (id) => `/procurement?open=${id}` },
  purchasePay: { icon: "wallet", href: (id) => `/procurement?open=${id}` },
  leaveTl: { icon: "calendar", href: () => "/hr?tab=leaves" },
  leaveHr: { icon: "calendar", href: () => "/hr?tab=leaves" },
  excuseTl: { icon: "alert", href: () => "/hr?tab=leaves" },
  excuseHr: { icon: "alert", href: () => "/hr?tab=leaves" },
  forgot: { icon: "fingerprint", href: () => "/hr?tab=att" },
  hrAction: { icon: "bell", href: (id) => `/hr?employee=${id}` },
  postToday: { icon: "bell", href: () => "/marketing?tab=content" },
  broadcastApprove: { icon: "megaphone", href: () => "/marketing?tab=broadcast" },
};

/** Which `/home/<module>` this person may call: the same grants the endpoints require. */
export interface TodaySources { tasks: boolean; tickets: boolean; deals: boolean; contracts: boolean; procurement: boolean; hr: boolean; marketing: boolean }

export function useTodayLines(sources: TodaySources): InboxLine[] {
  const t = useTranslations("pages.home.today");
  const results = useQueries({
    queries: (Object.keys(sources) as (keyof TodaySources)[]).map((m) => ({
      queryKey: ["home", m], enabled: sources[m], refetchInterval: 60_000, queryFn: () => api.get<TodayLine[]>(`/home/${m}`),
    })),
  });
  return results.flatMap((r) => r.data ?? []).map((x) => line(x, t));
}

type T = ReturnType<typeof useTranslations<"pages.home.today">>;

function line(x: TodayLine, t: T): InboxLine {
  const v = x.values, s = (k: string) => String(v[k] ?? "");
  // the values the words need shown: days and times in the reader's language, money with its currency («—» when hidden)
  const shown: Record<string, string | number> = { ...v, note: v.note ? ` · ${s("note")}` : "" };
  for (const k of ["due", "day", "end", "from", "to"]) if (v[k]) shown[k] = day(s(k));
  if (v.at) shown.at = x.kind === "ticket" ? ago(s("at")) : dayTime(s("at"));
  if ("amount" in v) shown.amount = s("amount") === "" ? "—" : money(s("amount"));
  return { key: `${x.kind}-${x.id}-${s("tcr")}`, tone: x.tone, icon: LOOK[x.kind].icon, title: t(`${x.kind}.title`, shown), sub: t(`${x.kind}.sub`, shown), href: LOOK[x.kind].href(x.id), button: t(`${x.kind}.button`) };
}
