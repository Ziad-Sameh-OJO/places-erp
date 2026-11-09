/**
 * M-12 · 11.10 «تقرير الأداء»: the sales figures and the performance report's rows, read the same way by the worker
 * (at the report's time) and the API («ابعته دلوقتي», 11.17). Queries only; the rules are in @places/domain.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type Schedule, type WorkCalendar, dayStart, dealRowOf, fromDecimal, monthBounds, monthLabel, periodFigures, targetPercent, toDecimal,
} from "@places/domain";

type Db = PrismaClient | Prisma.TransactionClient;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Every active salesperson's achievement in [from, to) against his monthly target (11.8 rules). */
export async function salesFigures(db: Db, month: string, from: Date, to: Date) {
  const people = await db.employee.findMany({
    where: { user: { status: "ACTIVE", roles: { some: { role: { key: "sales" } } } } },
    select: { id: true, name: true, team: true, target: true, teamLeaderId: true, teamLeader: { select: { name: true, userId: true } } }, orderBy: { name: "asc" },
  });
  const ids = people.map((p) => p.id);
  const [targets, deals] = await Promise.all([
    db.salesTarget.findMany({ where: { month, employeeId: { in: ids } } }),
    db.deal.findMany({ where: { participants: { some: { employeeId: { in: ids } } }, payments: { some: { receivedAt: { gte: from, lt: to } } } }, include: { participants: true, payments: true } }),
  ]);
  const rows = deals.map((d) => dealRowOf({ ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
    payments: d.payments.map((p) => ({ side: p.side, amount: p.amount.toFixed(2), receivedAt: p.receivedAt })) }));
  return people.map((p) => {
    const t = targets.find((x) => x.employeeId === p.id), goal = fromDecimal((t?.value ?? p.target).toFixed(2));
    return { ...p, goal, ...periodFigures(p.id, rows, from, to) };
  });
}

/** The period a report covers when it runs on `period`: the day / 7 days / month / 3 months before it, and the one before that. */
function windows(s: Schedule, period: string, cal: WorkCalendar) {
  if (s.freq === "daily" || s.freq === "weekly") {
    const n = s.freq === "daily" ? 1 : 7, at = (x: string) => dayStart(x, cal);
    return { month: shift(period, -1).slice(0, 7), label: `${shift(period, -n)} → ${shift(period, -1)}`, cur: [at(shift(period, -n)), at(period)] as const, prev: [at(shift(period, -2 * n)), at(shift(period, -n))] as const };
  }
  const months = s.freq === "monthly" ? 1 : 3;
  let first = period.slice(0, 7);
  for (let i = 0; i < months; i++) first = monthBounds(first, cal).prev;
  let before = first;
  for (let i = 0; i < months; i++) before = monthBounds(before, cal).prev;
  return { month: first, label: monthLabel(first), cur: [monthBounds(first, cal).from, dayStart(`${period.slice(0, 7)}-01`, cal)] as const, prev: [monthBounds(before, cal).from, monthBounds(first, cal).from] as const };
}

/** 11.10 «تقرير الأداء»: every salesperson and every team, against the period before. Column names are the Excel headers. */
export async function performanceRows(db: Db, s: Schedule, period: string, cal: WorkCalendar) {
  const w = windows(s, period, cal);
  const [cur, prev] = await Promise.all([salesFigures(db, w.month, ...w.cur), salesFigures(db, w.month, ...w.prev)]);
  const row = (name: string, team: string, goal: number, achieved: number, transactions: number, before: number) => ({
    "الاسم": name, "الفريق": team, "التارجت الشهري": toDecimal(goal), "دخل في التارجت": toDecimal(achieved), "النسبة من التارجت": `${Math.round(targetPercent(achieved, goal))}%`,
    "Transactions": transactions, "الفترة اللي قبلها": toDecimal(before), "الفرق": toDecimal(achieved - before),
  });
  const before = (id: string) => prev.find((x) => x.id === id)?.achieved ?? 0;
  const people = cur.map((p) => row(p.name, p.team ?? "", p.goal, p.achieved, p.transactions, before(p.id)));
  const teams = [...new Set(cur.flatMap((p) => (p.teamLeaderId ? [p.teamLeaderId] : [])))].map((tl) => {
    const m = cur.filter((p) => p.teamLeaderId === tl), sum = (f: (x: (typeof m)[number]) => number) => m.reduce((a, x) => a + f(x), 0);
    return row(`فريق ${m[0]!.teamLeader!.name}`, m[0]!.team ?? "", sum((x) => x.goal), sum((x) => x.achieved), sum((x) => x.transactions), sum((x) => before(x.id)));
  });
  return { title: `${s.freq === "monthly" ? "تقرير الأداء الشهري" : "تقرير الأداء"} · ${w.label}`, rows: [...people, ...teams] };
}
