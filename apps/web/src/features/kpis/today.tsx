"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { KpiToday, KpiTodayLineView } from "@places/contracts";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { Card, Chip, Icon } from "@/components/ui";
import type { InboxLine } from "@/components/inbox";
import { Bar } from "./kpis-page";

/** 11.16 · GET /home/kpis: my card and what the KPIs wait on me for (demo kpis.js kpiMine / kpiInbox). */
export const useKpiToday = () => useQuery({ queryKey: ["kpis", "today"], queryFn: () => api.get<KpiToday>("/home/kpis"), refetchInterval: 60_000 });

const href = (cardId: string) => `/kpis?card=${cardId}`;

/** The KPI lines of «مهامي النهارده», in the demo's words. */
export function useKpiLines(): InboxLine[] {
  const t = useTranslations("kpis.home");
  const pct = (s: number | null) => (s == null ? "" : `: ${Math.round(s)}%`);
  const line = (l: KpiTodayLineView): InboxLine => l.kind === "deliver"
    ? { key: `kpi-deliver-${l.cardId}-${l.item}`, tone: "warn", icon: "upload", title: t("deliverTitle", { item: l.item }), sub: t("deliverSub", { done: l.delivered, need: l.required }), href: href(l.cardId), button: t("deliver") }
    : l.kind === "approve"
      ? { key: `kpi-approve-${l.cardId}`, tone: "", icon: "chart", title: `KPIs ${l.name}${pct(l.score)}`, sub: t("approveSub", { count: l.manual }), href: href(l.cardId), button: t("open") }
      : { key: `kpi-enter-${l.cardId}`, tone: "", icon: "chart", title: t("enterTitle", { name: l.name }), sub: t("enterSub", { count: l.manual }), href: href(l.cardId), button: t("open") };
  return (useKpiToday().data?.lines ?? []).map(line);
}

/** «الـ KPIs بتاعتي» (demo kpiMine): the score, the quarter and who follows me, the first items under target. */
export function MyKpisCard() {
  const t = useTranslations("kpis.home");
  const c = useKpiToday().data?.mine;
  if (!c) return null;
  const tone = c.tone === "ok" ? "ok" : c.tone;
  const now = (it: (typeof c.below)[number]) => (it.method === "report" ? t("ofRequired", { done: it.delivered, need: it.required ?? 0 }) : t("ofTarget", { value: it.value == null ? "—" : num(it.value), target: it.targetText }));
  return (
    <Card title={t("mine")} icon="chart" sub={t("mineSub", { quarter: c.quarter, follower: serverText(c.follower) })} extra={c.score != null && <Chip tone={tone}>{Math.round(c.score)}%</Chip>}>
      {c.score != null && <Bar pct={c.score} tone={c.tone} />}
      {c.below.length
        ? <ul className="plain">{c.below.map((it) => <li key={it.title}><Icon name="alert" /><span>{it.title} <small className="hint">· {now(it)}</small></span></li>)}</ul>
        : <p className="hint">{t("allMet")}</p>}
      <div className="row end"><Link className="btn ghost sm" href={href(c.id)}>{t("openCard")}</Link></div>
    </Card>
  );
}
