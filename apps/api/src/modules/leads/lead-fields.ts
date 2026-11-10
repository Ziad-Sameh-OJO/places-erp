import type { ClientListUnit } from "../inventory/inventory.service";
import type { LeadQuery } from "./leads.repository";
import type { CreateLead, LeadDetail, LeadFilters, LeadRow, LeadSide, RecommendAnswers, RecommendedUnit, Recommendations, UpdateLead } from "@places/contracts";

/**
 * M-09 field permissions on the leads (catalog: domain fields/leads.ts): a hidden field's value never leaves the API —
 * blank in every row, its kind kept so the screens show «—» — a filter on it is dropped, and a field the person may
 * not change keeps its value. Units shown from a lead follow the inventory's rules (fields/inventory.ts).
 */
type Hidden = ReadonlySet<string>;

export function hideLeadRow<T extends Pick<LeadRow, "phones" | "area" | "type" | "space" | "budget" | "channel" | "campaign">>(r: T, hidden: Hidden): T {
  if (!hidden.size) return r;
  const h = (k: string) => hidden.has(k);
  return {
    ...r, phones: h("phones") ? [] : r.phones, area: h("area") ? "" : r.area, type: h("type") ? "" : r.type, space: h("space") ? null : r.space,
    budget: h("budget") ? null : r.budget, channel: h("channel") ? "" : r.channel, campaign: h("campaign") ? null : r.campaign,
  };
}

export function hideLeadDetail<T extends Omit<LeadDetail, "canSeeLogs" | "logCount">>(d: T, hidden: Hidden): T {
  if (!hidden.size) return d;
  const h = (k: string) => hidden.has(k);
  // the duplicate-attempt line repeats the typed mobiles: gone with the phones
  const activities = h("phones") ? d.activities.filter((a) => a.kind !== "duplicate") : d.activities;
  return { ...hideLeadRow(d, hidden), activities, company: h("company") ? null : d.company, condition: h("condition") ? null : d.condition, note: h("note") ? null : d.note, post: h("post") ? null : d.post };
}

/** One side of Operations' duplicate comparison. */
export function hideSide<T extends LeadSide>(s: T, hidden: Hidden): T {
  if (!hidden.size) return s;
  const h = (k: string) => hidden.has(k);
  return {
    ...s, company: h("company") ? null : s.company, phones: h("phones") ? [] : s.phones, area: h("area") ? "" : s.area, type: h("type") ? "" : s.type,
    space: h("space") ? null : s.space, budget: h("budget") ? null : s.budget, channel: h("channel") ? "" : s.channel, campaign: h("campaign") ? null : s.campaign,
  };
}

/** What the lead says the client wants, on the «الوحدات» tab. */
export function hideClient(c: Recommendations["client"], hidden: Hidden): Recommendations["client"] {
  if (!hidden.size) return c;
  const h = (k: string) => hidden.has(k);
  return { type: h("type") ? "" : c.type, space: h("space") ? null : c.space, condition: h("condition") ? null : c.condition, budget: h("budget") ? null : c.budget, area: h("area") ? "" : c.area };
}

/** The list filters minus those on hidden fields; `phoneSearch` false: «بحث» no longer finds a lead by its mobile. */
export function shownLeadFilters(f: LeadFilters, hidden: Hidden): LeadQuery {
  if (!hidden.size) return f;
  return {
    ...f, ...(hidden.has("area") ? { area: undefined } : {}), ...(hidden.has("channel") ? { channel: undefined } : {}),
    ...(hidden.has("campaignId") ? { campaignId: undefined } : {}), phoneSearch: !hidden.has("phones"),
  };
}

/**
 * A new lead: a field the person may not set starts empty. Mobile, Area, Type and Channel are what the lead can't be
 * saved without (the catalog's `required`): read only, they're still taken as typed on a new lead — that's all a
 * create can do with them — and a role that creates can't have them hidden (fieldRuleProblem).
 */
export function keepFixedCreate<T extends Partial<CreateLead>>(input: T, fixed: Hidden): T {
  if (!fixed.size) return input;
  const out: Record<string, unknown> = { ...input };
  for (const k of ["company", "companyCategory", "space", "condition", "budget", "campaignId", "note"]) if (fixed.has(k)) out[k] = undefined;
  return out as T;
}

/** «تعديل البيانات»: a field the person may not change keeps what the lead has (also when the form leaves it out). */
export function keepFixedUpdate(input: UpdateLead, before: StoredLead, fixed: Hidden): Required<Pick<UpdateLead, "phones" | "area" | "type">> & UpdateLead {
  const keep = (k: keyof StoredLead) => fixed.has(k);
  return {
    ...input,
    phones: keep("phones") || !input.phones ? before.phones : input.phones, area: keep("area") || !input.area ? before.area : input.area,
    type: keep("type") || !input.type ? (before.type as UpdateLead["type"] & string) : input.type,
    ...(keep("company") ? { company: before.company ?? undefined } : {}), ...(keep("space") ? { space: before.space ?? undefined } : {}),
    ...(keep("condition") ? { condition: before.condition ?? undefined } : {}), ...(keep("budget") ? { budget: before.budget ?? undefined } : {}),
    ...(keep("note") ? { note: before.note ?? undefined } : {}),
  } as Required<Pick<UpdateLead, "phones" | "area" | "type">> & UpdateLead;
}
export interface StoredLead { phones: string[]; area: string; type: string; company: string | null; space: number | null; condition: string | null; budget: string | null; note: string | null }

// ───────── the units shown from a lead: the inventory's rules ─────────

/** A narrowing question on a hidden unit field would tell its value: it isn't applied. */
const ANSWER_FIELD: Record<keyof RecommendAnswers, string | null> = { project: null, floor: "floor", parking: "parking", area: "area", split: "divisible", payment: "paymentMethod", deliveryBy: "delivery" };
export function shownAnswers(a: RecommendAnswers, hidden: Hidden): RecommendAnswers {
  if (!hidden.size) return a;
  return Object.fromEntries(Object.entries(a).filter(([k]) => { const f = ANSWER_FIELD[k as keyof RecommendAnswers]; return !f || !hidden.has(f); })) as RecommendAnswers;
}

/** The unit's price for the client (a month's rent or the total) is its Price / Sqm × the space (domain recommendUnits). */
const priceHidden = (hidden: Hidden) => hidden.has("pricePerSqm");

export function hideRecommended(u: RecommendedUnit, hidden: Hidden): RecommendedUnit {
  if (!hidden.size) return u;
  const h = (k: string) => hidden.has(k);
  return {
    ...u, area: h("area") ? "" : u.area, floor: h("floor") ? null : u.floor, space: h("space") ? 0 : u.space, condition: h("condition") ? "" : u.condition,
    parking: h("parking") ? 0 : u.parking, minSplit: h("minSplit") ? null : u.minSplit, price: priceHidden(hidden) ? null : u.price,
    split: h("divisible") ? false : u.split, sameArea: h("area") ? false : u.sameArea,
  };
}

/** A unit on the client's PDF list (and the comment it writes on the lead). */
export function hideListUnit(u: ClientListUnit, hidden: Hidden): ClientListUnit {
  if (!hidden.size) return u;
  const h = (k: string) => hidden.has(k);
  return {
    ...u, area: h("area") ? "" : u.area, floor: h("floor") ? null : u.floor, space: h("space") ? 0 : u.space, condition: h("condition") ? "" : u.condition,
    parking: h("parking") ? 0 : u.parking, totalPrice: priceHidden(hidden) ? null : u.totalPrice, splitOf: h("space") || h("divisible") ? null : u.splitOf,
  };
}
