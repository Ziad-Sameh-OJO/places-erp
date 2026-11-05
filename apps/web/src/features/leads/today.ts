"use client";
import { useQuery } from "@tanstack/react-query";
import type { LeadTodayItem } from "@places/contracts";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import type { InboxLine } from "@/components/inbox";
import { slaText } from "./lead-bits";
import { useBulkPending } from "./bulk";
import { usePendingCompanies } from "./companies";

/** «مهامي النهارده» from the leads (1.22): SLA alarms and the day's visits, in the demo's words (home.js). */
export function useLeadToday(enabled: boolean) {
  return useQuery({
    queryKey: ["leads", "today"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<LeadTodayItem[]>("/home/leads"),
    select: (items) => items.map(toLine),
  });
}

function toLine(x: LeadTodayItem): InboxLine {
  const href = `/leads?open=${x.lead.id}`;
  if (x.kind === "visit" && x.visit) {
    return { key: `visit-${x.visit.id}`, tone: x.tone, icon: "pin", title: `${x.visit.kind}: ${x.lead.name}`,
      sub: `${dayTime(x.visit.at)} · لازم تدوس Done`, href, button: "افتح" };
  }
  return { key: `sla-${x.lead.id}`, tone: x.tone, icon: "clock", title: `${x.lead.name} من غير أكشن`,
    sub: `${x.sla ? slaText(x.sla) : ""} · ${x.salesperson ?? "—"}`, href, button: "افتح الليد" };
}

/** Operations: each bulk entry waiting for its approval (1.19, demo «إدخال جماعي: N رقم · مستني موافقتك على التوزيع»). */
export function useBulkLines(enabled: boolean): InboxLine[] {
  return (useBulkPending(enabled).data ?? []).map((b) => ({ key: `bulk-${b.id}`, tone: "warn", icon: "upload", title: `إدخال جماعي: ${b.total} رقم`,
    sub: "مستني موافقتك على التوزيع", href: "/leads", button: "راجع" }));
}

/** Telesales: each company from a lead waiting to be added (1.20, demo «شركة جديدة: … · محتاجة تتضاف لشيت الشركات بكاتيجوري»). */
export function useNewCompanyLines(enabled: boolean): InboxLine[] {
  return (usePendingCompanies(enabled).data ?? []).map((p) => ({ key: `co-${p.id}`, tone: "warn", icon: "building", title: `شركة جديدة: ${p.name}`,
    sub: "محتاجة تتضاف لشيت الشركات بكاتيجوري", href: "/leads?companies=1", button: "شيت الشركات" }));
}
