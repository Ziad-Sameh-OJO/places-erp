"use client";
import { useQuery } from "@tanstack/react-query";
import type { Action, ModuleKey } from "@places/domain";
import { api } from "./api";

export interface Me { id: string; name: string; email: string; emailNotifications: boolean; roles: string[]; roleLabels: string[]; scope: string; permissions: Partial<Record<ModuleKey, Action[]>> }

/** The signed-in person and what they may do. Hiding buttons is for comfort; the API checks every call. */
export function useMe() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), staleTime: 60_000 });
  const can = (m: ModuleKey, a: Action = "view") => !!q.data?.permissions[m]?.includes(a);
  return { me: q.data, can, loading: q.isPending };
}
