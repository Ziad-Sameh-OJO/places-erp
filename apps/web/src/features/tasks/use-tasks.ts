"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTask, TaskOptions, TaskRow, TaskUnitOption } from "@places/contracts";
import { api } from "@/lib/api";

/** The whole board (the API sends the open tasks and a month of Done ones, already in the caller's scope). */
export const useTasks = () => useQuery({ queryKey: ["tasks"], queryFn: () => api.get<TaskRow[]>("/tasks") });
export const useTaskOptions = (enabled: boolean) => useQuery({ queryKey: ["task-options"], queryFn: () => api.get<TaskOptions>("/tasks/options"), enabled, staleTime: 60_000 });
/** Units a task can be about, by code or project (the new-task form). */
export const useTaskUnits = (q: string, enabled: boolean) =>
  useQuery({ queryKey: ["task-units", q], queryFn: () => api.get<TaskUnitOption[]>(`/tasks/units?q=${encodeURIComponent(q)}`), enabled });

export function useTaskActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  return {
    move: async (id: string, status: string) => { await api.post(`/tasks/${id}/status`, { status }); await refresh(); },
    create: async (body: CreateTask) => { const r = await api.post<{ id: string; warning: string | null }>("/tasks", body); await refresh(); return r; },
  };
}
