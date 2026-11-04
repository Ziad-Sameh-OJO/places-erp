"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paged, SlaReport, TicketDetail, TicketOptions, TicketRow, TicketSummary, TicketView } from "@places/contracts";
import { api } from "@/lib/api";

export const useTickets = (view: TicketView, q: string, page: number, pageSize: number) => {
  const qs = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize), ...(q ? { q } : {}) }).toString();
  return useQuery({ queryKey: ["tickets", qs], queryFn: () => api.get<Paged<TicketRow>>(`/tickets?${qs}`), placeholderData: keepPreviousData });
};
export const useTicketSummary = () => useQuery({ queryKey: ["tickets", "summary"], queryFn: () => api.get<TicketSummary>("/tickets/summary") });
export const useTicketOptions = () => useQuery({ queryKey: ["ticket-options"], queryFn: () => api.get<TicketOptions>("/tickets/options"), staleTime: 60_000 });
/** One ticket, for its drawer (only while one is open). */
export const useTicket = (id: string | null) => useQuery({ queryKey: ["ticket", id], queryFn: () => api.get<TicketDetail>(`/tickets/${id}`), retry: false, enabled: !!id });
export const useSlaReport = (month: string, enabled: boolean) =>
  useQuery({ queryKey: ["tickets", "report", month], queryFn: () => api.get<SlaReport>(`/tickets/report${month ? `?month=${month}` : ""}`), enabled, placeholderData: keepPreviousData });

/** After any change: the list, the tiles, the report and the open ticket. */
export function useRefreshTickets() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["tickets"] }), qc.invalidateQueries({ queryKey: ["ticket"] })]);
}
