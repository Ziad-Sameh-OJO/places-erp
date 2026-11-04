"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadDetail } from "@places/contracts";
import { api } from "@/lib/api";

/** One lead for the drawer (404 when it's outside the person's scope: the API decides). */
export const useLead = (id: string | null) =>
  useQuery({ queryKey: ["lead", id], queryFn: () => api.get<LeadDetail>(`/leads/${id}`), enabled: !!id });

/** After a change on one lead, the drawer, the list, the board and the tiles all refresh. */
export function useRefreshLead() {
  const qc = useQueryClient();
  return (id: string) => Promise.all([
    qc.invalidateQueries({ queryKey: ["lead", id] }),
    qc.invalidateQueries({ queryKey: ["leads"] }),
    qc.invalidateQueries({ queryKey: ["leads-summary"] }),
  ]);
}

export function useAddComment() {
  const refresh = useRefreshLead();
  return async (id: string, text: string) => {
    await api.post(`/leads/${id}/comments`, { text });
    await refresh(id);
  };
}
