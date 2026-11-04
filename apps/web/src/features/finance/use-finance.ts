"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountLedger, AccountNode, ChartView, EntryView, JournalView } from "@places/contracts";
import { api } from "@/lib/api";

/** M-07 · the chart with live balances (9.1). */
export const useChart = () => useQuery({ queryKey: ["finance", "chart"], queryFn: () => api.get<ChartView>("/finance/accounts") });
/** One account's movements, while its ledger is open. */
export const useLedger = (id: string | null) => useQuery({ queryKey: ["finance", "ledger", id], queryFn: () => api.get<AccountLedger>(`/finance/accounts/${id}/ledger`), enabled: !!id });

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
