"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadBoard, LeadOptions, LeadRow, LeadSummary, Paged, Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { type LeadQuery, toParams } from "./filters";

/** The leads in the caller's scope matching the filters (the API applies the scope). */
export function useLeads(f: LeadQuery, page: number, pageSize: number) {
  const qs = toParams(f, page, pageSize).toString();
  return useQuery({ queryKey: ["leads", qs], queryFn: () => api.get<Paged<LeadRow>>(`/leads?${qs}`), placeholderData: keepPreviousData });
}

/** The Kanban: every lane's real count and its newest cards, under the same filters. */
export function useLeadBoard(f: LeadQuery, enabled: boolean) {
  const qs = toParams(f, 1, 1).toString();
  return useQuery({ queryKey: ["leads", "board", qs], queryFn: () => api.get<LeadBoard>(`/leads/board?${qs}`), placeholderData: keepPreviousData, enabled });
}

export const useLeadSummary = () => useQuery({ queryKey: ["leads-summary"], queryFn: () => api.get<LeadSummary>("/leads/summary") });
export const useLeadOptions = () => useQuery({ queryKey: ["leads-options"], queryFn: () => api.get<LeadOptions>("/leads/options"), staleTime: 60_000 });
/** Areas and channels are admin lists (M-13). */
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings"), staleTime: 60_000 });

export function useChangeStage() {
  const qc = useQueryClient();
  return async (id: string, stage: string) => {
    await api.patch(`/leads/${id}/stage`, { stage });
    await Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] })]);
  };
}
