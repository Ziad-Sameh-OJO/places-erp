"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KpiBoard, KpiCardView, KpiCompany, KpiLogEntry } from "@places/contracts";
import { api } from "@/lib/api";
import { periodParams } from "@/components/period-picker";

export type Scope = "me" | "team" | "all";
/** `period` (14.12): "2025-Q4" reads that quarter's cards; "" the current quarter. */
export const useBoard = (scope: Scope | "mine", enabled = true, period = "") => useQuery({ queryKey: ["kpis", "board", scope, period], queryFn: () => api.get<KpiBoard>(`/kpis/board?scope=${scope}${period ? `&${periodParams(period)}` : ""}`), enabled });
export const useKpiCard = (id: string | null) => useQuery({ queryKey: ["kpis", "card", id], queryFn: () => api.get<KpiCardView>(`/kpis/cards/${id}`), enabled: !!id });
export const useCompany = (enabled: boolean) => useQuery({ queryKey: ["kpis", "company"], queryFn: () => api.get<KpiCompany>("/kpis/company"), enabled, retry: false });
export const useKpiLog = () => useQuery({ queryKey: ["kpis", "log"], queryFn: () => api.get<KpiLogEntry[]>("/kpis/log") });
/** Every KPI screen reads the same cards: any change refreshes them all. */
export const useRefreshKpis = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["kpis"] }); };
