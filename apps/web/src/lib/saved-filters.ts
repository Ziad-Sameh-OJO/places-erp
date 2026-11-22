"use client";
/**
 * A person's saved filters on a list page («فلاتري»): every filter they picked, under a name, one click to apply again.
 * Kept in this browser only, per person and per page, like the side menu's favourites (lib/quick.ts); nothing goes
 * to the API, so the API still decides what each filter may show. Storage can be blocked (private window): every
 * access is guarded and the page works without it.
 */
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useMe } from "./me";

export type FilterValues = Record<string, string | undefined>;
export interface SavedFilter { name: string; f: FilterValues }

const Saved = z.array(z.object({ name: z.string(), f: z.record(z.string(), z.string().optional()) })).catch([]);
const storeKey = (who: string, page: string) => `places-filters:${who}:${page}`;

/** Only the filters that are set, in a stable order: what tells two filter sets apart. */
const picked = (f: FilterValues) => Object.entries(f).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b));
export const sameFilters = (a: FilterValues, b: FilterValues) => JSON.stringify(picked(a)) === JSON.stringify(picked(b));
export const activeCount = (f: FilterValues) => picked(f).length;
/** Drops the empty values, so a saved filter keeps only what was picked. */
export const compact = (f: FilterValues): Record<string, string> => Object.fromEntries(picked(f)) as Record<string, string>;

/**
 * @param page the list's key (e.g. "inventory").
 * @param legacyKey where the page kept its views before they were per person (leads: «places.leads.views»); read once
 *   when the person has nothing saved yet.
 */
export function useSavedFilters(page: string, legacyKey?: string) {
  const who = useMe().me?.id;
  const [list, setList] = useState<SavedFilter[]>([]);
  useEffect(() => {
    if (!who) return;
    try {
      const own = localStorage.getItem(storeKey(who, page));
      setList(Saved.parse(JSON.parse(own ?? (legacyKey && localStorage.getItem(legacyKey)) ?? "[]")));
    } catch { setList([]); }
  }, [who, page, legacyKey]);
  const save = useCallback((next: SavedFilter[]) => {
    setList(next);
    if (!who) return;
    try { localStorage.setItem(storeKey(who, page), JSON.stringify(next)); } catch { /* storage blocked: kept until reload */ }
  }, [who, page]);
  return {
    list,
    add: (v: SavedFilter) => save([...list, { name: v.name, f: compact(v.f) }]),
    remove: (i: number) => save(list.filter((_, j) => j !== i)),
  };
}
