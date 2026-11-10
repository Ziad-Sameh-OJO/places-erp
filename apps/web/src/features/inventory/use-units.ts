"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AreaTabView, Paged, UnitDetail, UnitOptions, UnitRow, UnitSummary, UnitTabCounts } from "@places/contracts";
import { api } from "@/lib/api";

/** The toolbar's filters as the API's query names (UnitFilters in @places/contracts). Empty = not filtered. */
export interface UnitQuery {
  q?: string; area?: string; condition?: string; agentId?: string; stale?: "true"; divisible?: "true"; missing?: "true"; tabId?: string | undefined;
  type?: "Rent" | "Resale" | "Income" | "Primary" | undefined; view?: "available" | "closed" | undefined;
  closedFrom?: string; closedTo?: string; // the rented / sold sheet (M-03 5.2)
  sort?: string; dir?: "asc" | "desc"; // 0.15: the column the API sorts by, across every page
  websiteAd?: "yes" | "no" | undefined; // 4.13 · marketing's filter
}

export function toParams(f: UnitQuery, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p;
}

/** The units the person may see (sales: confirmed ones only, Q15 — the API decides). */
export function useUnits(f: UnitQuery, page: number, pageSize: number) {
  const qs = toParams(f, page, pageSize).toString();
  return useQuery({ queryKey: ["units", qs], queryFn: () => api.get<Paged<UnitRow>>(`/inventory/units?${qs}`), placeholderData: keepPreviousData });
}

/** The type tabs' counts under the same filters (the tab itself set aside). */
export function useUnitTabs(f: UnitQuery) {
  const qs = toParams({ ...f, type: undefined, view: undefined }, 1, 1).toString(); // the area tab stays: counts within it
  return useQuery({ queryKey: ["units", "tabs", qs], queryFn: () => api.get<UnitTabCounts>(`/inventory/units/tabs?${qs}`), placeholderData: keepPreviousData });
}

export const useUnitSummary = (enabled = true) => useQuery({ queryKey: ["units", "summary"], queryFn: () => api.get<UnitSummary>("/inventory/units/summary"), enabled });
export const useUnitOptions = () => useQuery({ queryKey: ["units-options"], queryFn: () => api.get<UnitOptions>("/inventory/units/options"), staleTime: 60_000 });
/** One unit, for its drawer (only while one is open). */
export const useUnit = (id: string | null) => useQuery({ queryKey: ["unit", id], queryFn: () => api.get<UnitDetail>(`/inventory/units/${id}`), retry: false, enabled: !!id });

/** The area tabs (2.5) with their counts under the list's filters, the area tab itself set aside. */
export function useAreaTabs(f: UnitQuery) {
  const qs = toParams({ ...f, tabId: undefined }, 1, 1).toString();
  return useQuery({ queryKey: ["area-tabs", qs], queryFn: () => api.get<AreaTabView[]>(`/inventory/area-tabs?${qs}`), placeholderData: keepPreviousData });
}
