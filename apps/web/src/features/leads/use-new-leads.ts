"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewLeadRequestRow } from "@places/contracts";
import { api } from "@/lib/api";
import { useRefreshLead } from "./use-lead";

const KEY = ["lead-new-leads"];

/** Operations' New Leads from Telesales (1.17). Only fetched for people who may route them; the clock ticks every minute. */
export function useNewLeads(enabled: boolean) {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<NewLeadRequestRow[]>("/leads/new-leads"), enabled, refetchInterval: 60_000 });
}

/** «ابعته كـ New Lead» (Telesales). */
export function useSendNewLead() {
  const refresh = useRefreshLead();
  return async (id: string) => {
    await api.post(`/leads/new-leads/${id}`);
    await refresh(id);
  };
}

/** Operations' decision: "rotation" or a salesperson's id. */
export function useRouteNewLead() {
  const qc = useQueryClient();
  const refresh = useRefreshLead();
  return async (id: string, to: string) => {
    await api.post(`/leads/new-leads/${id}/route`, { to });
    await Promise.all([qc.invalidateQueries({ queryKey: KEY }), refresh(id)]);
  };
}
