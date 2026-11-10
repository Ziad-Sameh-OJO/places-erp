import { z } from "zod";

/** 0.17 · the quick search (⌘K / «/», demo app.js cmdItems): one box over the records the person may open. */
export const SearchQuery = z.object({ q: z.string().trim().min(2, "اكتب حرفين على الأقل").max(80) });
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SEARCH_KINDS = ["lead", "unit", "client", "deal", "ticket", "employee"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
/** One result: what it is, its record, its name and the line under it (codes, mobile, area… as the lists show them); a unit's m² apart (the screen words it). */
export interface SearchHit { kind: SearchKind; id: string; label: string; sub: string[]; meters?: number }
/** At most 5 of each kind, in the order above; a kind the person may not see isn't there at all. */
export interface SearchResult { hits: SearchHit[] }
