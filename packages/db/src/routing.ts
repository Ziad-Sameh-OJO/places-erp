/**
 * 1.23 · the day's rotation, read the same way by the API (a new lead, New Lead 1.17, Draft 1.26 / 1.27, bulk 1.22)
 * and the worker's jobs (SLA pull 1.16, No Answer 1.17): who started first (the fingerprint, or the Visit time — 7.3),
 * nobody yet last, Operations' order by hand for the day winning. Queries only; the rules are in @places/domain.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { type DayVisit, type RoutingState, dayRotation, dayStart, dayStartTime, pickDayVisit, routingForDay } from "@places/domain";

type Db = PrismaClient | Prisma.TransactionClient;
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);
/** Leave that keeps someone out of the rotation: approved by the TL or closed by HR (M-05 6.2, 1.15). */
const ON_LEAVE = ["APPROVED_BY_TL", "CLOSED_BY_HR"] as const;

/** «HH:MM» of a moment on a Cairo day. */
export function clockOn(d: Date | null, day: string): string | null {
  if (!d) return null;
  const min = Math.round((d.getTime() - dayStart(day).getTime()) / 60_000);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** 7.3 · each salesperson's Visits that day (the lead's owner). Meetings stay out until the client says they count (open question). */
export async function dayVisits(db: Db, ids: readonly string[], day: string): Promise<Map<string, DayVisit[]>> {
  const from = dayStart(day);
  const rows = await db.leadVisit.findMany({ where: { kind: "visit", at: { gte: from, lt: new Date(from.getTime() + 86_400_000) }, lead: { assignedToId: { in: [...ids] } } },
    select: { at: true, outcome: true, postponeStatus: true, lead: { select: { assignedToId: true } } } });
  const out = new Map<string, DayVisit[]>();
  for (const v of rows) out.set(v.lead.assignedToId!, [...(out.get(v.lead.assignedToId!) ?? []),
    { at: clockOn(v.at, day)!, outcome: v.outcome === "done" || v.outcome === "not_done" ? v.outcome : null, postponed: v.postponeStatus === "approved" }]);
  return out;
}

/** When each one's day started (fingerprint or Visit) and the Visit that counted, «HH:MM» or null. */
export async function dayStarts(db: Db, ids: readonly string[], day: string): Promise<Map<string, { start: string | null; visit: string | null }>> {
  const [rows, visits] = await Promise.all([db.attendanceDay.findMany({ where: { employeeId: { in: [...ids] }, day: asDay(day) }, select: { employeeId: true, checkInAt: true } }), dayVisits(db, ids, day)]);
  return new Map(ids.map((id) => {
    const v = pickDayVisit(visits.get(id) ?? []), counted = v && v.outcome !== "not_done" ? v : null;
    return [id, { start: dayStartTime(clockOn(rows.find((r) => r.employeeId === id)?.checkInAt ?? null, day), counted), visit: counted?.at ?? null }];
  }));
}

/** The day's order by hand lives in its own Setting, so the next day starts automatic again by itself. */
export const manualOrderKey = (day: string) => `rotationOrder:${day}`;

export async function manualOrder(db: Db, day: string): Promise<string[] | null> {
  return ((await db.setting.findUnique({ where: { key: manualOrderKey(day) } }))?.value ?? null) as string[] | null;
}

/** These people in the day's order (domain dayRotation). */
export async function dayOrder(db: Db, ids: readonly string[], day: string): Promise<string[]> {
  if (ids.length < 2) return [...ids];
  const [starts, manual] = await Promise.all([dayStarts(db, ids, day), manualOrder(db, day)]);
  return dayRotation(ids, new Map([...starts].flatMap(([id, s]) => (s.start ? [[id, s.start] as const] : []))), manual);
}

/** Everyone on approved leave that day: they get no leads (1.15, M-05 6.2). */
export async function onLeave(db: Db, day: string): Promise<Set<string>> {
  return new Set((await db.leaveRequest.findMany({ where: { status: { in: [...ON_LEAVE] }, fromDay: { lte: asDay(day) }, toDay: { gte: asDay(day) } }, select: { employeeId: true } })).map((r) => r.employeeId));
}

/**
 * Who may get a lead of `area` that day, in the day's order: the area's ticked salespeople (1.13) minus `except` (the
 * one it leaves), anyone whose account was switched off and anyone on approved leave (1.15).
 */
export async function areaPool(db: Db, area: string, day: string, except: string | null = null): Promise<string[]> {
  const pools = ((await db.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
  const ids = (pools[area] ?? []).filter((id) => id !== except);
  const [active, away] = await Promise.all([
    db.employee.findMany({ where: { id: { in: ids }, user: { status: { not: "DISABLED" } } }, select: { id: true } }),
    onLeave(db, day),
  ]);
  const ok = new Set(active.map((e) => e.id));
  return dayOrder(db, ids.filter((id) => ok.has(id) && !away.has(id)), day);
}

/**
 * The rotation's turns, locked for the transaction (a pull and a new lead at once both keep their turn), started over
 * from the top of the day's order on a new day (routingForDay).
 */
export async function lockRouting(tx: Prisma.TransactionClient, day: string): Promise<RoutingState> {
  await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES ('routing', '{"cursor":{},"skipTurns":{}}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
  const [row] = await tx.$queryRaw<Array<{ value: RoutingState }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = 'routing' FOR UPDATE`;
  return routingForDay({ cursor: {}, skipTurns: {}, ...row?.value }, day);
}

export function saveRouting(tx: Prisma.TransactionClient, state: RoutingState) {
  return tx.setting.update({ where: { key: "routing" }, data: { value: state as never } });
}
