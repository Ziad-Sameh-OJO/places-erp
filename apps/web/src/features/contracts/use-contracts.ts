"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CollectionReport, ContractCalendar, ContractDetail, ContractForm, ContractRow, ContractSummary, Paged } from "@places/contracts";
import type { InstallmentState } from "@places/domain";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";

export const useContracts = (q: string, ending: boolean, page: number) => {
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...(q ? { q } : {}), ...(ending ? { ending: "true" } : {}) });
  return useQuery({ queryKey: ["contracts", "list", q, ending, page], queryFn: () => api.get<Paged<ContractRow>>(`/contracts?${qs}`) });
};
export const useContract = (id: string | null) => useQuery({ queryKey: ["contracts", "one", id], queryFn: () => api.get<ContractDetail>(`/contracts/${id}`), enabled: !!id });
export const useSummary = () => useQuery({ queryKey: ["contracts", "summary"], queryFn: () => api.get<ContractSummary>("/contracts/summary") });
export const useCalendar = (month: string) => useQuery({ queryKey: ["contracts", "calendar", month], queryFn: () => api.get<ContractCalendar>(`/contracts/calendar?month=${month}`) });
export const useCollections = (month: string) => useQuery({ queryKey: ["contracts", "collections", month], queryFn: () => api.get<CollectionReport>(`/contracts/collections?month=${month}`) });
export const useContractForm = (on: boolean) => useQuery({ queryKey: ["contracts", "form"], queryFn: () => api.get<ContractForm>("/contracts/form"), enabled: on });

export const useRefreshContracts = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["contracts"] });
};

/** The demo's chip tones for an installment: اتدفع · جزء · متأخر · لسه (the words are `contracts.installment.<state>`). */
export const INSTALLMENT_TONE: Record<InstallmentState, "ok" | "warn" | "bad" | ""> = { paid: "ok", partial: "warn", late: "bad", due: "" };

/** The status chip as the demo shows it: «قرّب يخلص» (`endingSoon`, already in the reader's language) for an active contract with 90 days or less left. */
export const statusChip = (c: ContractRow, endingSoon: string): ["ok" | "warn" | "", string] =>
  c.status === "Active" ? (c.endingSoon ? ["warn", endingSoon] : ["ok", "Active"]) : ["", serverText(c.status)];

export const openContractFile = async (id: string) => {
  const { url } = await api.get<{ url: string }>(`/contracts/${id}/file`);
  window.open(url, "_blank", "noopener");
};
