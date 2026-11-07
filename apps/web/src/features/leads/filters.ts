"use client";
import { useCallback, useEffect, useState } from "react";

/** The toolbar's filters, as the API's query names (LeadFilters in @places/contracts). Empty = not filtered. */
export interface LeadQuery {
  q?: string; stage?: string; channel?: string; campaignId?: string; assignedToId?: string; area?: string;
  qualified?: "true" | "false"; from?: string; to?: string;
  kind?: "client" | "broker" | undefined; // the tab, not a filter: saved views don't keep it
}

export function toParams(f: LeadQuery, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p;
}

/** Same filters regardless of key order or empty values: tells which saved view is the current one. */
export const sameFilters = (a: LeadQuery, b: LeadQuery) => key(a) === key(b);
const key = (f: LeadQuery) => JSON.stringify(Object.entries(f).filter(([, v]) => v).sort(([x], [y]) => x.localeCompare(y)));
export const activeCount = (f: LeadQuery) => Object.values(f).filter(Boolean).length;

/** The demo's built-in views; their counts come from the summary, their names from the messages (leads.views.presets.<count>). */
export const PRESETS: { f: LeadQuery; count: "total" | "fresh" | "qualified" | "noAnswer" | "interested" }[] = [
  { f: {}, count: "total" },
  { f: { stage: "Fresh" }, count: "fresh" },
  { f: { qualified: "true" }, count: "qualified" },
  { f: { stage: "No Answer" }, count: "noAnswer" },
  { f: { stage: "Interested" }, count: "interested" },
];

export interface SavedView { name: string; f: LeadQuery }
const STORE = "places.leads.views";

/**
 * The person's own saved filters. Kept in this browser only (a comfort, like the demo); storage can be blocked or
 * empty (private window), so every access is guarded and the page works without it.
 */
export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    try { setViews(JSON.parse(localStorage.getItem(STORE) ?? "[]") as SavedView[]); } catch { setViews([]); }
  }, []);
  const save = useCallback((next: SavedView[]) => {
    setViews(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* storage blocked: the views last until reload */ }
  }, []);
  return {
    views,
    add: (v: SavedView) => save([...views, v]),
    remove: (i: number) => save(views.filter((_, j) => j !== i)),
  };
}
