"use client";
import { STAGE_TABS } from "@places/domain";

/** The toolbar's filters, as the API's query names (LeadFilters in @places/contracts). Empty = not filtered. */
export type LeadQuery = {
  // assignedToId: one or several salespeople, comma separated (14.6) · teamLeaderId: «التيم» · propertyType: «النوع»
  q?: string; stage?: string; channel?: string; campaignId?: string; assignedToId?: string; teamLeaderId?: string; area?: string; propertyType?: string;
  qualified?: "true" | "false"; from?: string; to?: string;
  // the client's list (22 Nov): «Type», company, space and budget ranges, duplicated, «Created by», «Assign from»,
  // «Assign date», «Action date» + «Last action», the cancel reason
  type?: string; company?: string; spaceMin?: string; spaceMax?: string; budgetMin?: string; budgetMax?: string; duplicated?: "true" | "false";
  createdById?: string; previousOwnerId?: string; wentToId?: string; assignedFrom?: string; assignedTo?: string; actionFrom?: string; actionTo?: string; action?: string;
  cancelReason?: string;
  visit?: string; visitFrom?: string; visitTo?: string; // the dashboard's Showings / Meetings: a Visit / Meeting held in those days
  kind?: "client" | "broker" | undefined; // the tab, not a filter: saved views don't keep it
  sort?: string; dir?: "asc" | "desc"; // 0.15: the column the API sorts by (not a filter either)
};

export function toParams(f: LeadQuery, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p;
}

/** Same filters regardless of key order or empty values: tells which saved view is the current one. */
export const sameFilters = (a: LeadQuery, b: LeadQuery) => key(a) === key(b);
const key = (f: LeadQuery) => JSON.stringify(Object.entries(f).filter(([, v]) => v).sort(([x], [y]) => x.localeCompare(y)));
export const activeCount = (f: LeadQuery) => Object.entries(f).filter(([k, v]) => v && !NOT_FILTERS.has(k)).length;
const NOT_FILTERS = new Set(["kind", "sort", "dir"]);
/** The filters under «فلاتر أكتر»: how many of them are on (shown on the button, so a closed panel doesn't hide one). */
export const MORE_FILTERS = ["propertyType", "type", "campaignId", "company", "spaceMin", "spaceMax", "budgetMin", "budgetMax", "from", "to", "assignedFrom", "assignedTo",
  "actionFrom", "actionTo", "action", "previousOwnerId", "wentToId", "createdById", "duplicated", "cancelReason", "qualified", "visit", "visitFrom", "visitTo"] as const satisfies readonly (keyof LeadQuery)[];
export const moreCount = (f: LeadQuery) => MORE_FILTERS.filter((k) => f[k]).length;

/**
 * 14.5 · the stage tabs above the list (domain STAGE_TABS, no «Qualified»): a tab sets the stage and keeps the other
 * filters (they all work together, 14.6). Interested opens Visit and Meeting inside it: shown while one of the three
 * is picked.
 */
export const STAGE_TAB_LIST = STAGE_TABS;
export const subTabsOf = (stage: string | undefined) => STAGE_TABS.find((t) => t.stage === stage || t.sub?.some((x) => x === stage))?.sub ?? [];
