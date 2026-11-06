"use client";
import { useQuery } from "@tanstack/react-query";
import type { DealsToCollect } from "@places/contracts";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { InboxLine } from "@/components/inbox";

/**
 * «صفقة اتقفلت · حصّل عمولة» (M-02, meeting 4 Nov · demo finance.js financeInbox): a line per approved deal still to
 * collect, on the accountant's «مهامي النهارده» and the finance dashboard. «حصّل» opens the deal on its «سجّل تحصيل».
 */
export function useCollectLines(enabled: boolean): InboxLine[] {
  const data = useQuery({
    queryKey: ["deals", "to-collect"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<DealsToCollect>("/home/collect"),
  }).data;
  return (data?.items ?? []).map((d) => ({
    key: `collect-${d.id}`, tone: "warn", icon: "handshake", title: `صفقة اتقفلت · حصّل عمولة ${d.code}`,
    sub: d.remaining === d.commission ? `${d.company} · ${money(d.commission)} · اتفتحله حساب تحت العملاء` : `${d.company} · باقي ${money(d.remaining)} من ${money(d.commission)}`,
    href: `/deals?open=${d.id}`, button: "حصّل",
  }));
}
