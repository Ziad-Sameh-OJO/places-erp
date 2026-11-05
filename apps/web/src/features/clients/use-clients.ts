"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ClientFile, ClientRow, ClientSummary, Paged } from "@places/contracts";
import { api } from "@/lib/api";

/** The toolbar: the search and the demo's «الكل · عملاء · ملاك». Empty = not filtered. */
export interface ClientQuery { q?: string; kind?: "client" | "owner" | undefined }

export function useClients(f: ClientQuery, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const qs = p.toString();
  return useQuery({ queryKey: ["clients", qs], queryFn: () => api.get<Paged<ClientRow>>(`/clients?${qs}`), placeholderData: keepPreviousData });
}

export const useClientSummary = () => useQuery({ queryKey: ["clients", "summary"], queryFn: () => api.get<ClientSummary>("/clients/summary") });
/** One file, for its drawer (only while one is open). */
export const useClient = (id: string | null) => useQuery({ queryKey: ["client", id], queryFn: () => api.get<ClientFile>(`/clients/${id}`), retry: false, enabled: !!id });
