/**
 * M-06 · internal tickets: the types and where each one goes, the SLA of each type, when a ticket is late and who is
 * told, the status a reply moves it to, and the per-department «اتقفل في الـ SLA» report (M-06 6.1, KPI M-12).
 * The types are data: a new type (the Excuse of 7.4, for example) is one more entry here, not new code paths.
 */
import { type WorkCalendar, PLACES_CALENDAR, wallClockMinutesBetween, workingMinutesBetween } from "./business-time.ts";

export interface TicketType {
  readonly key: string;
  readonly label: string;
  /** the department this type always goes to; null = the person opening it picks the department */
  readonly department: string | null;
  readonly slaHours: number;
  /** M-06 2.4: high priority answers in 4 working hours; null = priority doesn't change this type's SLA */
  readonly highSlaHours: number | null;
  /** "working" = Cairo working hours only (business-time.ts); "wall" = the plain clock */
  readonly clock: "working" | "wall";
  /** what the SLA waits for: the department's first reply, or the ticket settled (Resolved / Closed) */
  readonly measure: "reply" | "resolve";
  /** who is told when the SLA passes: the department's manager (M-06 2.4) or a role key (a dispute → Nancy) */
  readonly escalateTo: "manager" | string;
  /** opened and decided only by its own module's flow (the Excuse: TL then HR, 7.4), never from the tickets form */
  readonly system?: boolean;
}

export const TICKET_TYPES: readonly TicketType[] = [
  // M-06 2.4: «الرد خلال 24 ساعة عمل (أو 4 ساعات لو الأولوية عالية). ولو اتأخر، يتصعّد لمدير القسم»
  { key: "request", label: "طلب عادي", department: null, slaHours: 24, highSlaHours: 4, clock: "working", measure: "reply", escalateTo: "manager" },
  // M-06 2.2 (36): straight to HR, no Team Leader · KPI Basant «HR Letters خلال 24 ساعة»
  { key: "hr_letter", label: "HR Letter", department: "HR", slaHours: 24, highSlaHours: null, clock: "wall", measure: "reply", escalateTo: "manager" },
  // M-06 3.1 + M-12 7.1: «كل النزاعات تتحسم خلال 48 ساعة» and the system alerts Nancy (Office Manager)
  { key: "dispute", label: "نزاع", department: "الإدارة", slaHours: 48, highSlaHours: null, clock: "wall", measure: "resolve", escalateTo: "officemgr" },
  // M-12: Marwa «طلبات الـ Team Leaders من الـ Lists خلال 24 ساعة من الطلب · طلب الـ List كتذكرة»
  { key: "list", label: "طلب List", department: "Inventory", slaHours: 24, highSlaHours: null, clock: "wall", measure: "reply", escalateTo: "manager" },
  // M-06 3.1: Mokhtar «الشراء والصيانة 48 ساعة»
  // M-05 7.4: «الـ Excuse نوع تذكرة (8.1): TL ثم HR» — decided in HR's Excuse flow, shown here with its history
  { key: "excuse", label: "Excuse", department: "HR", slaHours: 24, highSlaHours: null, clock: "working", measure: "resolve", escalateTo: "manager", system: true },
  { key: "purchase", label: "شراء / صيانة", department: "Accounts", slaHours: 48, highSlaHours: null, clock: "wall", measure: "reply", escalateTo: "manager" },
];

export const TICKET_PRIORITIES = ["normal", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
/** M-06 3.3 · the stages, in order */
export const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
export const OPEN_TICKET_STATUSES: readonly string[] = ["Open", "In Progress"];
/** Who counts as «مدير القسم» for an escalation: the department's people holding a role of these tiers (seed roles.json). */
export const DEPARTMENT_MANAGER_TIERS: readonly string[] = ["Department Head", "Office Manager", "Operations Head"];

export const ticketType = (key: string): TicketType | undefined => TICKET_TYPES.find((t) => t.key === key);

/** The department a new ticket goes to: the type's own, else the one picked. */
export const ticketDepartment = (type: TicketType, picked: string | null | undefined): string | null => type.department ?? picked ?? null;

export const slaMinutes = (type: TicketType, priority: string): number =>
  (priority === "high" && type.highSlaHours !== null ? type.highSlaHours : type.slaHours) * 60;

export const slaElapsed = (type: TicketType, from: Date, to: Date, cal: WorkCalendar = PLACES_CALENDAR): number =>
  type.clock === "working" ? workingMinutesBetween(from, to, cal) : wallClockMinutesBetween(from, to);

export interface TicketClock {
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly firstReplyAt: Date | null;
  readonly resolvedAt: Date | null;
}

/** Late = still open, the awaited thing (first reply / settling) hasn't happened, and the type's SLA has passed. */
export function isTicketLate(t: TicketClock, now: Date, cal: WorkCalendar = PLACES_CALENDAR): boolean {
  const type = ticketType(t.type);
  if (!type || !OPEN_TICKET_STATUSES.includes(t.status)) return false;
  if (type.measure === "reply" && t.firstReplyAt) return false;
  return slaElapsed(type, t.createdAt, now, cal) > slaMinutes(type, t.priority);
}

/** «اتقفلت في الـ SLA» (M-06 6.1): settled, and settled within the type's SLA. */
export function closedInSla(t: TicketClock, cal: WorkCalendar = PLACES_CALENDAR): boolean {
  const type = ticketType(t.type);
  return !!type && !!t.resolvedAt && slaElapsed(type, t.createdAt, t.resolvedAt, cal) <= slaMinutes(type, t.priority);
}

/**
 * The status after a reply (demo «tkReply»): the department may move it to In Progress / Resolved; its first reply
 * moves an Open ticket to In Progress by itself. The person who opened it only writes, the status stays.
 */
export function statusAfterReply(status: string, byHandler: boolean, requested: string | undefined): string {
  if (!byHandler) return status;
  if (requested) return requested;
  return status === "Open" ? "In Progress" : status;
}

export interface DepartmentSla {
  readonly department: string;
  readonly total: number;
  readonly closed: number;
  readonly closedInSla: number;
  /** closed in the SLA ÷ all tickets (KPI «التذاكر اللي اتقفلت في الـ SLA ÷ كل التذاكر»); null when there are none */
  readonly percent: number | null;
  /** M-06 3.2: average of (first reply − opened), in minutes; null when nothing was answered yet */
  readonly avgReplyMinutes: number | null;
}

/** One row per department: the ones listed (even with no tickets) and any other a ticket went to. */
export function slaReport(
  tickets: ReadonlyArray<TicketClock & { readonly department: string }>, departments: readonly string[], cal: WorkCalendar = PLACES_CALENDAR,
): DepartmentSla[] {
  const byDept = new Map<string, Array<TicketClock & { readonly department: string }>>(departments.map((d) => [d, []]));
  for (const t of tickets) byDept.set(t.department, [...(byDept.get(t.department) ?? []), t]);
  return [...byDept].map(([department, list]) => {
    const inSla = list.filter((t) => closedInSla(t, cal)).length;
    const replies = list.filter((t) => t.firstReplyAt).map((t) => wallClockMinutesBetween(t.createdAt, t.firstReplyAt!));
    return {
      department,
      total: list.length,
      closed: list.filter((t) => t.resolvedAt).length,
      closedInSla: inSla,
      percent: list.length ? Math.round((inSla / list.length) * 100) : null,
      avgReplyMinutes: replies.length ? Math.round(replies.reduce((s, m) => s + m, 0) / replies.length) : null,
    };
  });
}
