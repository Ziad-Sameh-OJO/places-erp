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

/** «مهامي النهارده» from the leads (1.22 · 1.33 · 1.34): every line the API gives this person, in the demo's words (home.js). */
export function useLeadToday(enabled: boolean) {
  const t = useTranslations("leads");
  return useQuery({
    queryKey: ["leads", "today"], enabled, refetchInterval: 60_000,
    queryFn: () => api.get<LeadTodayItem[]>("/home/leads"),
    select: (items) => items.map((x) => toLine(x, t)),
  });
}

function toLine(x: LeadTodayItem, t: LeadsT): InboxLine {
  if (x.kind === "draftAdmin" && x.drafts) { // 1.34: the Draft Admin's daily Alarm, not one lead
    const d = x.drafts;
    return { key: "draft-admin", tone: x.tone, icon: "alert", title: t("drafts.alarm", { count: d.waiting }) + (d.today ? t("drafts.alarmToday", { count: d.today }) : ""),
      sub: d.leads.map((l) => t("today.draftItem", { name: l.name, stage: l.stage, from: l.from ?? "—" })).join(t("today.sep")) + (d.waiting > d.leads.length ? "…" : ""),
      href: "/leads?draft=admin", button: t("drafts.review") };
  }
  const lead = x.lead ?? { id: "", name: "" };
  const href = `/leads?open=${lead.id}`, name = lead.name;
  switch (x.kind) {
    case "tlNote": // 1.33
      return { key: `tl-${lead.id}`, tone: x.tone, icon: "star", title: t("today.tlNote", { name }), sub: x.tlNote ?? "", href, button: t("today.open") };
    case "newLead": { // 1.34 · demo: Operations' clock on a New Lead from Telesales (11.15)
      const n = x.minutesLeft ?? 0;
      return { key: `nl-${lead.id}`, tone: x.tone, icon: "send", title: t("today.newLeadTitle", { name }),
        sub: n < 0 ? t("today.newLeadLate", { n: -n }) : t("today.newLeadLeft", { n }), href: "/leads", button: t("today.decide") };
    }
    case "telesales":
      return { key: `ts-${lead.id}`, tone: x.tone, icon: "phone", title: t("today.backTitle", { name }), sub: t("today.backSub"), href, button: t("today.open") };
    case "postpone":
      return { key: `pp-${x.visit?.id ?? lead.id}`, tone: x.tone, icon: "pin", title: t("today.postponeTitle", { kind: x.visit?.kind ?? "Visit", name }),
        sub: t("today.postponeSub", { sales: x.salesperson ?? "—", at: x.visit ? dayTime(x.visit.at) : "—", reason: x.reason || "—" }), href, button: t("today.decide") };
    case "noAnswer":
      return { key: `na-${lead.id}`, tone: x.tone, icon: "phone", title: t("today.noAnswerTitle", { name }), sub: t("today.noAnswerSub", { h: x.remindH ?? 4 }), href, button: t("today.open") };
    case "visit":
      if (x.visit) return { key: `visit-${x.visit.id}`, tone: x.tone, icon: "pin", title: `${x.visit.kind}: ${name}`, sub: t("today.visitSub", { at: dayTime(x.visit.at) }), href, button: t("today.open") };
  }
  return { key: `sla-${lead.id}`, tone: x.tone, icon: "clock", title: t("today.noAction", { name }),
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
    sub: t("companySub"), href: "/companies", button: t("companySheet") }));
}
