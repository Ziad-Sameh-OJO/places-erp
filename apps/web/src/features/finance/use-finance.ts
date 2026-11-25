"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommissionPerson, CommissionStatement, AccountLedger, AccountNode, BillsView, BudgetView, CashView, IncomeView, PayrollView, ChartView, EntryView, JournalView, MoveView, MovesView } from "@places/contracts";
import { api } from "@/lib/api";
import { periodParams } from "@/components/period-picker";

/** M-07 · the chart with live balances (9.1). */
export const useChart = () => useQuery({ queryKey: ["finance", "chart"], queryFn: () => api.get<ChartView>("/finance/accounts") });
/** One account's movements, while its ledger is open; `range` = only a period's (the income statement's drill-down). */
export interface LedgerRange { from: string; to: string | null }
export function useLedger(id: string | null, range?: LedgerRange) {
  const qs = range ? `?from=${range.from}${range.to ? `&to=${range.to}` : ""}` : "";
  return useQuery({ queryKey: ["finance", "ledger", id, qs], queryFn: () => api.get<AccountLedger>(`/finance/accounts/${id}/ledger${qs}`), enabled: !!id });
}

export interface JournalQuery { from?: string; to?: string; q?: string }
export function useJournal(f: JournalQuery, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const qs = p.toString();
  return useQuery({ queryKey: ["finance", "journal", qs], queryFn: () => api.get<JournalView>(`/finance/journal?${qs}`), placeholderData: keepPreviousData });
}
export const useEntry = (id: string | null) => useQuery({ queryKey: ["finance", "entry", id], queryFn: () => api.get<EntryView>(`/finance/journal/${id}`), enabled: !!id });

/** After any posting: the tree, the ledgers and the journal all move together. */
export function useRefreshFinance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["finance"] });
}

/** Every account in the tree, depth-first, with its path («الأصول ← الاصول المتداولة ← …»). */
export function flatten(nodes: AccountNode[], path: string[] = []): { node: AccountNode; path: string[]; leaf: boolean }[] {
  return nodes.flatMap((n) => [{ node: n, path: [...path, n.name], leaf: !n.children.length }, ...flatten(n.children, [...path, n.name])]);
}

/** Codes the system keeps (retained earnings, the year's result): no sub-accounts, no manual lines. */
export const SYSTEM_CODES = new Set(["33", "34"]);

/* ---- 9.2 · 9.3 · 9.11 ---- */
export const useCash = () => useQuery({ queryKey: ["finance", "cash"], queryFn: () => api.get<CashView>("/finance/cash") });
export function useMoves(accountId: string, page: number, pageSize = 20) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(accountId ? { accountId } : {}) }).toString();
  return useQuery({ queryKey: ["finance", "moves", qs], queryFn: () => api.get<MovesView>(`/finance/moves?${qs}`), placeholderData: keepPreviousData });
}
export const useMove = (id: string | null) => useQuery({ queryKey: ["finance", "move", id], queryFn: () => api.get<MoveView>(`/finance/moves/${id}`), enabled: !!id });
export const useBudget = () => useQuery({ queryKey: ["finance", "budget"], queryFn: () => api.get<BudgetView>("/finance/budget") });

export type MoveKind = "pay" | "receive" | "transfer" | "advance" | "custody" | "settle" | "payroll" | "commission";
/** The demo's KIND: the chip tone; the label is `finance.kind.<kind>` in the messages. */
export const KIND: Record<MoveKind, "bad" | "ok" | "info" | "warn" | ""> = {
  payroll: "bad", commission: "bad", pay: "bad", receive: "ok", transfer: "info", advance: "warn", custody: "warn", settle: "",
};
export const useBills = () => useQuery({ queryKey: ["finance", "bills"], queryFn: () => api.get<BillsView>("/finance/bills") });
/** `period` (14.12): "2025-Q4" = that quarter's movement, instead of the month / the year. */
export const useIncome = (range: "month" | "year", period = "") => useQuery({ queryKey: ["finance", "income", range, period], queryFn: () => api.get<IncomeView>(`/finance/statements/income?range=${range}${period ? `&${periodParams(period)}` : ""}`) });
export const usePayroll = () => useQuery({ queryKey: ["finance", "payroll"], queryFn: () => api.get<PayrollView>("/finance/payroll") });
/* ---- 9.15 ---- */
export const useCommissionPeople = () => useQuery({ queryKey: ["finance", "commissions"], queryFn: () => api.get<CommissionPerson[]>("/finance/commissions") });
export const useCommission = (employeeId: string) => useQuery({ queryKey: ["finance", "commissions", employeeId], queryFn: () => api.get<CommissionStatement>(`/finance/commissions/${employeeId}`) });
