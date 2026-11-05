"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractCalendar, ContractDetail, ContractForm, ContractRow, ContractSummary, Paged } from "@places/contracts";
import type { InstallmentState } from "@places/domain";
import { api } from "@/lib/api";

export const useContracts = (q: string, ending: boolean, page: number) => {
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...(q ? { q } : {}), ...(ending ? { ending: "true" } : {}) });
  return useQuery({ queryKey: ["contracts", "list", q, ending, page], queryFn: () => api.get<Paged<ContractRow>>(`/contracts?${qs}`) });
};
export const useContract = (id: string | null) => useQuery({ queryKey: ["contracts", "one", id], queryFn: () => api.get<ContractDetail>(`/contracts/${id}`), enabled: !!id });
export const useSummary = () => useQuery({ queryKey: ["contracts", "summary"], queryFn: () => api.get<ContractSummary>("/contracts/summary") });
export const useCalendar = (month: string) => useQuery({ queryKey: ["contracts", "calendar", month], queryFn: () => api.get<ContractCalendar>(`/contracts/calendar?month=${month}`) });
export const useContractForm = (on: boolean) => useQuery({ queryKey: ["contracts", "form"], queryFn: () => api.get<ContractForm>("/contracts/form"), enabled: on });

export const useRefreshContracts = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["contracts"] });
};

/** The demo's chips for an installment: اتدفع · جزء · متأخر · لسه. */
export const INSTALLMENT: Record<InstallmentState, ["ok" | "warn" | "bad" | "", string]> = {
  paid: ["ok", "اتدفع"], partial: ["warn", "جزء"], late: ["bad", "متأخر"], due: ["", "لسه"],
};

/** The status chip as the demo shows it: «قرّب يخلص» for an active contract with 90 days or less left. */
export const statusChip = (c: ContractRow): ["ok" | "warn" | "", string] =>
  c.status === "Active" ? (c.endingSoon ? ["warn", "قرّب يخلص"] : ["ok", "Active"]) : ["", c.status];

export const openContractFile = async (id: string) => {
  const { url } = await api.get<{ url: string }>(`/contracts/${id}/file`);
  window.open(url, "_blank", "noopener");
};
