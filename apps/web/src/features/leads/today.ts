"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadTodayItem } from "@places/contracts";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import type { InboxLine } from "@/components/inbox";
import { type LeadsT, slaText } from "./lead-bits";
import { useBulkPending } from "./bulk";
import { usePendingCompanies } from "./companies";

/** «مهامي النهارده» from the leads (1.22): SLA alarms and the day's visits, in the demo's words (home.js). */
export function useLeadToday(enabled: boolean) {
  const t = useTranslations("leads");
  return useQuery({
    queryKey: ["leads", "today"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<LeadTodayItem[]>("/home/leads"),
    select: (items) => items.map((x) => toLine(x, t)),
  });
}

function toLine(x: LeadTodayItem, t: LeadsT): InboxLine {
  const href = `/leads?open=${x.lead.id}`;
  if (x.kind === "visit" && x.visit) {
    return { key: `visit-${x.visit.id}`, tone: x.tone, icon: "pin", title: `${x.visit.kind}: ${x.lead.name}`,
      sub: t("today.visitSub", { at: dayTime(x.visit.at) }), href, button: t("today.open") };
  }
  return { key: `sla-${x.lead.id}`, tone: x.tone, icon: "clock", title: t("today.noAction", { name: x.lead.name }),
    sub: `${x.sla ? slaText(x.sla, t) : ""} · ${x.salesperson ?? "—"}`, href, button: t("today.openLead") };
}

/** Operations: each bulk entry waiting for its approval (1.19, demo «إدخال جماعي: N رقم · مستني موافقتك على التوزيع»). */
export function useBulkLines(enabled: boolean): InboxLine[] {
  const t = useTranslations("leads.today");
  return (useBulkPending(enabled).data ?? []).map((b) => ({ key: `bulk-${b.id}`, tone: "warn", icon: "upload", title: t("bulkTitle", { count: b.total }),
    sub: t("bulkSub"), href: "/leads", button: t("review") }));
}

/** Telesales: each company from a lead waiting to be added (1.20, demo «شركة جديدة: … · محتاجة تتضاف لشيت الشركات بكاتيجوري»). */
export function useNewCompanyLines(enabled: boolean): InboxLine[] {
  const t = useTranslations("leads.today");
  return (usePendingCompanies(enabled).data ?? []).map((p) => ({ key: `co-${p.id}`, tone: "warn", icon: "building", title: t("companyTitle", { name: p.name }),
    sub: t("companySub"), href: "/leads?companies=1", button: t("companySheet") }));
}
