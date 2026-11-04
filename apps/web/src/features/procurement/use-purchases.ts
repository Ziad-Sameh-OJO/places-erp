"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProcurementOverview, PurchaseStatusKey, PurchasesView, PurchaseView, Settings } from "@places/contracts";
import { activeValues } from "@places/contracts";
import { api } from "@/lib/api";

export interface PurchaseFilter { status?: string; accountId?: string; group?: string; vendor?: string; from?: string; to?: string }

export const usePurchases = (f: PurchaseFilter, page: number) => {
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  return useQuery({ queryKey: ["procurement", "list", f, page], queryFn: () => api.get<PurchasesView>(`/procurement/purchases?${qs}`) });
};
export const usePurchase = (id: string | null) => useQuery({ queryKey: ["procurement", "one", id], queryFn: () => api.get<PurchaseView>(`/procurement/purchases/${id}`), enabled: !!id });
export const useOverview = () => useQuery({ queryKey: ["procurement", "overview"], queryFn: () => api.get<ProcurementOverview>("/procurement/overview") });
/** «لستة الموردين من الإعدادات» (M-13 lists): the active ones. */
export const useVendors = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings"), select: (s) => activeValues(s.vendors) });

export const useRefreshProcurement = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["procurement"] });
};

/** demo LV / SL: the chip tone and label of each status. */
export const STATUS: Record<PurchaseStatusKey, ["ok" | "warn" | "bad" | "info", string]> = {
  Pending: ["warn", "Pending"], Approved: ["info", "Approved"], Rejected: ["bad", "Rejected"],
  Settled: ["warn", "اتسوّى · مستني المالية"], Posted: ["ok", "اترحّل في المالية"],
};

/** Opens an attachment through the request's own access check (a 5-minute link). */
export const openFile = async (purchaseId: string, fileId: string) => {
  const { url } = await api.get<{ url: string }>(`/procurement/purchases/${purchaseId}/files/${fileId}`);
  window.open(url, "_blank", "noopener");
};
