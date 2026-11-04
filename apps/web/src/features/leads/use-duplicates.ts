"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DuplicateDecision, DuplicateRow } from "@places/contracts";
import { api } from "@/lib/api";

const KEY = ["lead-duplicates"];

/** Operations' queue of duplicates. Only fetched for people who may decide (the API checks it again). */
export function useDuplicates(enabled: boolean) {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<DuplicateRow[]>("/leads/duplicates"), enabled });
}

export function useDecideDuplicate() {
  const qc = useQueryClient();
  return async (id: string, decision: DuplicateDecision) => {
    await api.post(`/leads/duplicates/${id}/decide`, decision);
    await qc.invalidateQueries({ queryKey: KEY });
  };
}
