/** M-01 · lead stages, the Qualified flag, the SLA clock, and round-robin routing by area. */
import { type WorkCalendar, PLACES_CALENDAR, wallClockMinutesBetween, workingMinutesBetween } from "./business-time.ts";

export const LEAD_STAGES = [
  "Fresh", "Interested", "Not Interested", "No Answer", "Follow up to Visit", "Visit", "Follow up after Visit",
  "Follow up to Meeting", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal", "Cancellation", "Hold",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** The pipeline, in order (demo PIPE); the side stages (Not Interested, No Answer, Cancellation, Hold) aren't on it. */
export const LEAD_PIPELINE: readonly LeadStage[] = [
  "Fresh", "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Follow up to Meeting", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal",
];

/** Reaching any of these marks the lead Qualified for good (M-01 2.7, M-04 2.7). */
const QUALIFYING: ReadonlySet<LeadStage> = new Set([
  "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Follow up to Meeting", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal",
]);

export type VisitKind = "Visit" | "Meeting";

/**
 * Where a Visit / Meeting moves the lead by itself (4 Nov demo meeting · 1.9): booking it → «Follow up to …», marking it
 * Done → «Visit» / «Meeting». Only forward along the pipeline: a lead already further on (Near to Close) stays where it
 * is, and null means «no move». A lead on a side stage (No Answer, Hold…) joins the pipeline, as in the demo.
 */
export function visitStage(current: LeadStage, kind: VisitKind, event: "booked" | "done"): LeadStage | null {
  const to: LeadStage = event === "booked" ? `Follow up to ${kind}` : kind;
  const at = LEAD_PIPELINE.indexOf(current);
  return at >= 0 && LEAD_PIPELINE.indexOf(to) <= at ? null : to;
}

/**
 * Qualified is sticky: once true it never goes back. Cancellation and Hold count only if the lead
 * had already been Interested (Q8) — i.e. only if it was already qualified.
 */
export function isQualifiedAfter(wasQualified: boolean, next: LeadStage): boolean {
  return wasQualified || QUALIFYING.has(next);
}

/** Who a new lead goes to. `to` is an Employee id; "route" means the area's round-robin (Q1). */
export type LeadPlacement =
  | { readonly kind: "hand"; readonly to: string }      // Operations picked the salesperson: uses up their turn (Q2)
  | { readonly kind: "telesales"; readonly to: string } // Telesales keeps it to call herself: no SLA until it leaves her
  | { readonly kind: "own"; readonly to: string }       // a salesperson's own lead stays theirs (Q3)
  | { readonly kind: "route" };

/**
 * Where a new lead goes (M-01 · answers-telesales-voice): Telesales chooses «يفضل عندي» (keep) or «التوزيع»;
 * a lead she sends to routing must not stay hers, so unlike a salesperson her lead isn't kept by default.
 */
export function placeNewLead(
  by: { readonly employeeId: string | null; readonly isTelesales: boolean; readonly ownScope: boolean },
  choice: { readonly assignToId?: string | undefined; readonly keep?: boolean | undefined },
): LeadPlacement {
  if (choice.assignToId) return { kind: "hand", to: choice.assignToId };
  if (by.isTelesales) return choice.keep && by.employeeId ? { kind: "telesales", to: by.employeeId } : { kind: "route" };
  if (by.ownScope && by.employeeId) return { kind: "own", to: by.employeeId };
  return { kind: "route" };
}

export interface SlaRules {
  /** working minutes before the Team Leader is warned / the lead is pulled (2h30 / 3h) */
  readonly warnAfter: number;
  readonly pullAfter: number;
  /** on official holidays the clock is wall-clock: warn 22h, pull 24h */
  readonly holidayWarnAfter: number;
  readonly holidayPullAfter: number;
}
export const DEFAULT_SLA: SlaRules = { warnAfter: 150, pullAfter: 180, holidayWarnAfter: 22 * 60, holidayPullAfter: 24 * 60 };

export type SlaLevel = "ok" | "warn" | "pull";
export interface SlaState { readonly level: SlaLevel; readonly elapsed: number; readonly minutesLeft: number }

/**
 * Where a fresh lead stands on its SLA clock, counted from when it reached the salesperson (Q4).
 * Returns null when the clock doesn't apply (already touched, not Fresh, or owned by Telesales).
 */
export function leadSla(
  lead: { stage: LeadStage; touched: boolean; ownedByTelesales: boolean; assignedAt: Date },
  now: Date,
  opts: { holidayMode: boolean; rules?: SlaRules; calendar?: WorkCalendar } = { holidayMode: false },
): SlaState | null {
  if (lead.stage !== "Fresh" || lead.touched || lead.ownedByTelesales) return null;
  const r = opts.rules ?? DEFAULT_SLA;
  const elapsed = opts.holidayMode ? wallClockMinutesBetween(lead.assignedAt, now) : workingMinutesBetween(lead.assignedAt, now, opts.calendar ?? PLACES_CALENDAR);
  const warn = opts.holidayMode ? r.holidayWarnAfter : r.warnAfter;
  const pull = opts.holidayMode ? r.holidayPullAfter : r.pullAfter;
  const level: SlaLevel = elapsed >= pull ? "pull" : elapsed >= warn ? "warn" : "ok";
  return { level, elapsed, minutesLeft: Math.max(0, pull - elapsed) };
}

/** What the list and the Kanban show (demo: the SLA bar and the card colour): the clock plus how far along it is. */
export interface SlaView extends SlaState { readonly pct: number }

export function slaView(
  lead: Parameters<typeof leadSla>[0],
  now: Date,
  opts: { holidayMode: boolean; rules?: SlaRules; calendar?: WorkCalendar } = { holidayMode: false },
): SlaView | null {
  const s = leadSla(lead, now, opts);
  if (!s) return null;
  const r = opts.rules ?? DEFAULT_SLA;
  const pull = opts.holidayMode ? r.holidayPullAfter : r.pullAfter;
  return { ...s, pct: Math.min(100, Math.round((s.elapsed / pull) * 100)) };
}

/**
 * Round-robin routing per area (Q1–Q3). Each area has its own ordered list of salespeople and its own cursor.
 * When Operations hands a lead to someone by hand, that person's next turn is skipped (Q2).
 * State is plain data so it can be persisted between requests; the class only holds the rules.
 */
export interface RoutingState { cursor: Record<string, number>; skipTurns: Record<string, number>; day?: string }

/**
 * 1.23: each day's rotation starts from the top of that day's order («أول واحد بصم بياخد أول ليد»); skipped turns carry
 * over. Never back a day: a job whose clock is behind (a tick that started before midnight) keeps the newer day's turns.
 */
export const routingForDay = (s: RoutingState, day: string): RoutingState => (s.day !== undefined && s.day >= day ? s : { ...s, cursor: {}, day });

export class LeadRouter {
  readonly #state: RoutingState;

  constructor(state: RoutingState = { cursor: {}, skipTurns: {} }) {
    this.#state = state;
  }

  /** The next salesperson for `area`, or null when nobody covers it. Never loops forever. */
  next(area: string, pool: readonly string[]): string | null {
    if (pool.length === 0) return null;
    for (let tries = 0; tries < pool.length * 2; tries++) {
      const i = (this.#state.cursor[area] ?? 0) % pool.length;
      const id = pool[i]!;
      this.#state.cursor[area] = i + 1;
      const skips = this.#state.skipTurns[id] ?? 0;
      if (skips > 0) { this.#state.skipTurns[id] = skips - 1; continue; }
      return id;
    }
    return pool[0]!;
  }

  /** A hand assignment uses up the person's next turn in the rotation. */
  assignedByHand(salesId: string): void {
    this.#state.skipTurns[salesId] = (this.#state.skipTurns[salesId] ?? 0) + 1;
  }

  snapshot(): RoutingState {
    return structuredClone(this.#state);
  }
}

/** Who covers each area (M-01 Q1: «هيتوزع على الناس اللي متحدده للـ area دي بس»), in the order they rotate. */
export type AreaRouting = Record<string, string[]>;

/**
 * Ticking / unticking a salesperson for an area (1.12, the demo's areas × salespeople table): someone added goes to
 * the end of that area's rotation, someone removed leaves it; the others keep their order. Never twice.
 */
export function setAreaMember(routing: AreaRouting, area: string, employeeId: string, on: boolean): AreaRouting {
  const pool = (routing[area] ?? []).filter((id) => id !== employeeId);
  return { ...routing, [area]: on ? [...pool, employeeId] : pool };
}

/** Bulk upload (Telesales → Operations approval): spread `count` numbers over today's salespeople in order. */
export function distributeEvenly(count: number, salespeople: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (salespeople.length === 0) return out;
  const base = Math.floor(count / salespeople.length);
  salespeople.forEach((id, i) => out.set(id, base + (i < count % salespeople.length ? 1 : 0)));
  return out;
}

/** What Operations compares when a lead comes in twice (demo «عميل مكرر»): the label is the table's first column. */
export const DUPLICATE_FIELDS = [["name", "الاسم"], ["area", "Area"], ["type", "Type"], ["space", "Space"], ["budget", "Budget"]] as const;
export type DuplicateField = (typeof DUPLICATE_FIELDS)[number][0];
export type DuplicateChoice = Partial<Record<DuplicateField | "channel", "old" | "new">>;

/** The facts both sides have. Budget stays a decimal string: nothing is computed on it here. */
export interface LeadFacts {
  readonly name: string; readonly area: string; readonly type: string; readonly space: number | null; readonly budget: string | null;
  readonly channel: string; readonly campaignId: string | null; readonly phones: readonly string[];
}

/**
 * Operations' decision on a duplicate (M-01 Q7): for each field the existing value stays unless «new» is chosen,
 * the channel (with its campaign) that gets the credit likewise, and the mobiles of both are kept, once each.
 * Returns only what changes, and the labels of what was taken from the new entry (for the Activity line).
 */
export function mergeDuplicate(existing: LeadFacts, incoming: LeadFacts, choice: DuplicateChoice): { changes: Partial<LeadFacts>; took: string[] } {
  const changes: { -readonly [K in keyof LeadFacts]?: LeadFacts[K] } = {};
  const took: string[] = [];
  for (const [field, label] of DUPLICATE_FIELDS) {
    if (choice[field] === "new" && incoming[field] !== existing[field]) {
      (changes as Record<string, unknown>)[field] = incoming[field];
      took.push(label);
    }
  }
  if (choice.channel === "new" && (incoming.channel !== existing.channel || incoming.campaignId !== existing.campaignId)) {
    changes.channel = incoming.channel;
    changes.campaignId = incoming.campaignId;
    took.push("الـ channel");
  }
  const phones = [...new Set([...existing.phones, ...incoming.phones])];
  if (phones.length !== existing.phones.length) changes.phones = phones;
  return { changes, took };
}

/**
 * The lead's «Logs» tab (client meeting, 4 Nov · task 1.25): the admin always sees it, plus the roles the admin
 * picks in the settings (`leadLogRoles`). Anyone else doesn't get the tab at all.
 */
export const LOG_ADMIN_ROLE = "admin";
export function canSeeLeadLogs(roles: readonly string[], allowedRoles: readonly string[]): boolean {
  return roles.includes(LOG_ADMIN_ROLE) || roles.some((r) => allowedRoles.includes(r));
}
