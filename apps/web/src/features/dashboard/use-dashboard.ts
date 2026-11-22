"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { AhmedDashboard, CompanyDashboard, DashboardLayoutView, MyDashboard, PersonPerformance } from "@places/contracts";
import { api } from "@/lib/api";
import { periodParams } from "@/components/period-picker";

/** 14.1: which dashboard is mine (the API decides: a company layout only for whoever sees the whole company). */
export const useDashboardLayout = (enabled = true) =>
  useQuery({ queryKey: ["dashboard", "layout"], queryFn: () => api.get<DashboardLayoutView>("/dashboard/layout"), staleTime: 5 * 60_000, enabled });
export const useCompanyDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ["dashboard", "company"], queryFn: () => api.get<CompanyDashboard>("/dashboard/company"), enabled, refetchInterval: 5 * 60_000 });
/** Ahmed's one page: `period` today|week|month|quarter, a quarter with its "2026-Q4", the target card's quarter ("" = default); fresh every 60 s. */
export const useAhmedDashboard = (period: string, quarter: string, tq: string) =>
  useQuery({
    queryKey: ["dashboard", "ahmed", period, quarter, tq],
    queryFn: () => api.get<AhmedDashboard>(`/dashboard/ahmed?period=${period}${period === "quarter" && quarter ? `&${periodParams(quarter)}` : ""}${tq ? `&tq=${tq}` : ""}`),
    refetchInterval: 60_000, placeholderData: (prev) => prev,
  });
export const useMyDashboard =(enabled: boolean) =>
  useQuery({ queryKey: ["dashboard", "mine"], queryFn: () => api.get<MyDashboard>("/dashboard/mine"), enabled });
export const usePerson = (employeeId: string | null) =>
  useQuery({ queryKey: ["dashboard", "person", employeeId], queryFn: () => api.get<PersonPerformance>(`/dashboard/people/${employeeId}`), enabled: !!employeeId });

/**
 * 14.1 «أول ما يدخلوا»: the first page of a session is the dashboard for its people; after that «مهامي النهارده» opens
 * as always. Remembered in this tab only (a comfort: blocked storage just means no jump).
 */
const LANDED = "places.landed";
const firstTime = (): boolean => {
  try {
    const first = !sessionStorage.getItem(LANDED);
    sessionStorage.setItem(LANDED, "1");
    return first;
  } catch { return false; }
};

/** The sign-in page starts a new session: the next «/» lands on the dashboard again. */
export const freshLanding = () => { try { sessionStorage.removeItem(LANDED); } catch { /* storage blocked: nothing to forget */ } };

/** On «مهامي النهارده»: the first time in a session, its people go on to their dashboard. */
export function useLanding() {
  const router = useRouter();
  const landing = useDashboardLayout().data?.landing;
  useEffect(() => {
    if (landing && firstTime() && landing === "/dashboard") router.replace("/dashboard");
  }, [landing, router]);
}

/** Opening the dashboard itself counts as having landed. */
export const markLanded = () => void firstTime();
