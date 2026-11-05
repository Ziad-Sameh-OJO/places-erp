"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { api } from "@/lib/api";

export const useCampaigns = () => useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<CampaignRow[]>("/marketing/campaigns") });
/** «الـ Channels» (M-13), the active ones. */
export const useChannels = () => useQuery({ queryKey: ["campaign-channels"], queryFn: () => api.get<string[]>("/marketing/campaigns/channels"), staleTime: 60_000 });

export function useCampaignActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns"] });
  return {
    save: async (id: string | null, body: CampaignInput) => { await (id ? api.put(`/marketing/campaigns/${id}`, body) : api.post("/marketing/campaigns", body)); await refresh(); },
    archive: async (id: string) => { await api.del(`/marketing/campaigns/${id}`); await refresh(); },
  };
}
