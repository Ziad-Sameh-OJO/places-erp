"use client";
import { useQuery } from "@tanstack/react-query";
import type { Paged } from "@places/contracts";
import { api } from "@/lib/api";

interface LeadRow { id: string; code: string; name: string; stage: string; area: string; qualified: boolean }

/** Reference feature: data via React Query, types from @places/contracts, rules from @places/domain. */
export function LeadsList() {
  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => api.get<Paged<LeadRow>>("/leads") });
  if (isLoading) return <p>بيحمّل…</p>;
  return (
    <ul>
      {data?.items.map((l) => <li key={l.id}>{l.code} · {l.name} · {l.stage}</li>)}
    </ul>
  );
}
