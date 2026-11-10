"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { BillsView, BudgetView, ClaimsView, CommissionPerson, DealsToCollect, PayrollView, PurchaseView } from "@places/contracts";
import { fromDecimal, toDecimal } from "@places/domain";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { money } from "./money";
import type { InboxLine } from "@/components/inbox";

/** A finance tab a line opens: `/finance?tab=…` (FinanceView starts on it; the dashboard switches to it in place). */
const tab = (t: string) => `/finance?tab=${t}`;

/**
 * 9.19 · the accountant's whole «مستنيك النهارده» (demo finance.js financeInbox + claims.js claimsInbox), on the home
 * page and the finance dashboard: claims to issue, e-invoices to upload, claim collections to record, closed deals to
 * collect, sales commissions due, settled purchases to pay, the payroll, the recurring bills and the budget. Each line
 * opens where it is done. Built from the endpoints those screens already use, so their permissions and scope apply.
 */
export function useFinanceTodo(enabled: boolean): InboxLine[] {
  const t = useTranslations("finance");
  const o = { enabled, refetchInterval: 60_000 };
  const collect = useQuery({ ...o, queryKey: ["deals", "to-collect"], queryFn: () => api.get<DealsToCollect>("/home/collect") }).data;
  const claims = useQuery({ ...o, queryKey: ["finance", "claims", "open"], queryFn: () => api.get<ClaimsView>("/claims?status=open") }).data;
  const people = useQuery({ ...o, queryKey: ["finance", "commissions"], queryFn: () => api.get<CommissionPerson[]>("/finance/commissions") }).data;
  const settled = useQuery({ ...o, queryKey: ["procurement", "settled"], queryFn: () => api.get<PurchaseView[]>("/procurement/purchases/settled") }).data;
  const payroll = useQuery({ ...o, queryKey: ["finance", "payroll"], queryFn: () => api.get<PayrollView>("/finance/payroll") }).data;
  const bills = useQuery({ ...o, queryKey: ["finance", "bills"], queryFn: () => api.get<BillsView>("/finance/bills") }).data;
  const budget = useQuery({ ...o, queryKey: ["finance", "budget"], queryFn: () => api.get<BudgetView>("/finance/budget") }).data;
  const lines: InboxLine[] = [];
  const open = t("dash.open");
  for (const c of claims?.items ?? []) {
    if (c.status === "requested") lines.push({ key: `claim-${c.id}`, tone: "warn", icon: "file", title: t("todo.claimIssue", { no: c.no, company: c.company }), sub: t("todo.claimIssueSub", { amount: money(c.amount), by: c.by.name }), href: tab("claims"), button: open });
    if (c.status === "approved") lines.push({ key: `einv-${c.id}`, tone: "warn", icon: "file", title: t("todo.einvoice", { no: c.no }), sub: `${c.company} · ${money(c.amount)}`, href: tab("claims"), button: t("todo.upload") });
    if (c.receiptAsked && c.status !== "paid") lines.push({ key: `receipt-${c.id}`, tone: "warn", icon: "wallet", title: t("todo.claimCollect", { no: c.no }), sub: t("todo.claimCollectSub", { company: c.company, amount: money(c.amount) }), href: tab("claims"), button: t("todo.record") });
  }
  for (const d of collect?.items ?? []) {
    lines.push({ key: `collect-${d.id}`, tone: "warn", icon: "handshake", title: t("collect.title", { code: d.code }),
      sub: d.remaining === d.commission ? t("collect.subNew", { company: d.company, commission: money(d.commission) }) : t("collect.subPart", { company: d.company, remaining: money(d.remaining), commission: money(d.commission) }),
      href: `/deals?open=${d.id}`, button: t("collect.button") });
  }
  const due = (people ?? []).filter((p) => fromDecimal(p.balance || "0") > 0);
  if (due.length) lines.push({ key: "commissions", tone: "warn", icon: "wallet", title: t("todo.commissions", { n: String(due.length) }), sub: t("todo.commissionsSub", { total: money(toDecimal(due.reduce((s, p) => s + fromDecimal(p.balance), 0))) }), href: tab("payroll"), button: open });
  for (const p of settled ?? []) lines.push({ key: `pr-${p.id}`, tone: "warn", icon: "cart", title: t("todo.purchase", { no: p.no }), sub: t("todo.purchaseSub", { item: p.item, amount: money(p.amount) }), href: tab("cash"), button: open });
  if (payroll?.due && payroll.rows.length) lines.push({ key: "payroll", tone: "warn", icon: "wallet", title: t("dash.payrollTitle", { label: serverText(payroll.label) }), sub: t("dash.payrollSub", { count: payroll.totals.people, n: String(payroll.totals.people), net: money(payroll.totals.net) }), href: tab("payroll"), button: open });
  for (const b of bills?.items.filter((x) => x.state === "due") ?? []) lines.push({ key: `bill-${b.id}`, tone: "warn", icon: "calendar", title: t("dash.billTitle", { name: b.name }), sub: t("dash.billSub", { amount: money(b.amount), vendor: b.vendor }), href: tab("cash"), button: open });
  for (const r of budget?.rows.filter((x) => x.level === "bad" || x.level === "warn") ?? []) {
    lines.push({ key: `budget-${r.accountId}`, tone: r.level === "bad" ? "bad" : "warn", icon: "wallet", title: r.level === "bad" ? t("dash.lineOver", { name: serverText(r.name) }) : t("dash.lineNear", { name: serverText(r.name) }),
      sub: t("dash.lineSub", { spent: money(r.spent), budget: money(r.budget ?? "0") }), href: tab("budget"), button: open });
  }
  return lines;
}
