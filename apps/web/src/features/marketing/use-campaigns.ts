"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CampaignInput, CampaignRow, PageNameRow } from "@places/contracts";
import { api } from "@/lib/api";

export const useCampaigns = () => useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<CampaignRow[]>("/marketing/campaigns") });
/** «الـ Channels» (M-13), the active ones. */
export const useChannels = () => useQuery({ queryKey: ["campaign-channels"], queryFn: () => api.get<string[]>("/marketing/campaigns/channels"), staleTime: 60_000 });
/** 4.19 · «أسماء الصفحات»: the campaign's «Page name» list. */
export const usePages = () => useQuery({ queryKey: ["campaign-pages"], queryFn: () => api.get<PageNameRow[]>("/marketing/campaigns/pages") });

export function useCampaignActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns"] });
  const pages = () => Promise.all([qc.invalidateQueries({ queryKey: ["campaign-pages"] }), refresh()]);
  return {
    save: async (id: string | null, body: CampaignInput) => { await (id ? api.put(`/marketing/campaigns/${id}`, body) : api.post("/marketing/campaigns", body)); await pages(); },
    archive: async (id: string) => { await api.del(`/marketing/campaigns/${id}`); await refresh(); },
    addPage: async (name: string) => { await api.post("/marketing/campaigns/pages", { name }); await pages(); },
    renamePage: async (id: string, name: string) => { await api.put(`/marketing/campaigns/pages/${id}`, { name }); await pages(); },
    removePage: async (id: string) => { await api.del(`/marketing/campaigns/pages/${id}`); await pages(); },
  };
}
