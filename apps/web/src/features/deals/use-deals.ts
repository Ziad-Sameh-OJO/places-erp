"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Achievements, CashView, ClaimsView, DealCollectForm, DealDetail, DealForm, DealSheet, DealUnit } from "@places/contracts";
import type { DealStatus } from "@places/domain";
import { api } from "@/lib/api";

export const useDealSheet = () => useQuery({ queryKey: ["deals", "sheet"], queryFn: () => api.get<DealSheet>("/deals/sheet") });
export const useDeal = (id: string) => useQuery({ queryKey: ["deals", "one", id], queryFn: () => api.get<DealDetail>(`/deals/${id}`), retry: false });
export const useAchievements = () => useQuery({ queryKey: ["deals", "achv"], queryFn: () => api.get<Achievements>("/deals/achievements") });
export const useDealForm = () => useQuery({ queryKey: ["deals", "form"], queryFn: () => api.get<DealForm>("/deals/form") });
export const useDealUnits = () => useQuery({ queryKey: ["deals", "units"], queryFn: () => api.get<DealUnit[]>("/deals/units") });
export const useCollectForm = (enabled: boolean) => useQuery({ queryKey: ["deals", "collect-form"], queryFn: () => api.get<DealCollectForm>("/deals/collect-form"), enabled });
export const useCashAccounts = (enabled: boolean) => useQuery({ queryKey: ["finance", "cash"], queryFn: () => api.get<CashView>("/finance/cash"), enabled });
export const useClaimsAll = () => useQuery({ queryKey: ["finance", "claims", "all"], queryFn: () => api.get<ClaimsView>("/claims?status=all") });

/** After any change on a deal: the sheet, the drawer and the ledger (a collection posts entries) move together. */
export function useRefreshDeals() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["deals"] }), qc.invalidateQueries({ queryKey: ["finance"] })]);
}

/** The demo's ST_LVL. */
export const ST_TONE: Record<DealStatus, "warn" | "info" | "ok" | "bad"> = {
  "Pending Review": "warn", Approved: "info", "Partially Collected": "warn", "Fully Collected": "ok", Rejected: "bad", Cancelled: "bad",
};
export const LANES: DealStatus[] = ["Pending Review", "Approved", "Partially Collected", "Fully Collected"];
/** «لما توافق عليها تبان وتتسجل في الشيت» */
export const onSheet = (s: DealStatus) => s !== "Pending Review" && s !== "Rejected";
export const live = (s: DealStatus) => onSheet(s) && s !== "Cancelled";
export const monthOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-EG", { month: "long", year: "numeric", timeZone: "Africa/Cairo" }) : "—");
export const names = (p: { name: string }[]) => p.map((x) => x.name).join(" · ") || "—";
