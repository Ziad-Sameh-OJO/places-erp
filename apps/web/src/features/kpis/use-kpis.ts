"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KpiBoard, KpiCardView, KpiCompany, KpiLogEntry } from "@places/contracts";
import { api } from "@/lib/api";

export type Scope = "me" | "team" | "all";
export const useBoard = (scope: Scope | "mine", enabled = true) => useQuery({ queryKey: ["kpis", "board", scope], queryFn: () => api.get<KpiBoard>(`/kpis/board?scope=${scope}`), enabled });
export const useKpiCard = (id: string | null) => useQuery({ queryKey: ["kpis", "card", id], queryFn: () => api.get<KpiCardView>(`/kpis/cards/${id}`), enabled: !!id });
export const useCompany = (enabled: boolean) => useQuery({ queryKey: ["kpis", "company"], queryFn: () => api.get<KpiCompany>("/kpis/company"), enabled, retry: false });
export const useKpiLog = () => useQuery({ queryKey: ["kpis", "log"], queryFn: () => api.get<KpiLogEntry[]>("/kpis/log") });
/** Every KPI screen reads the same cards: any change refreshes them all. */
export const useRefreshKpis = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["kpis"] }); };
