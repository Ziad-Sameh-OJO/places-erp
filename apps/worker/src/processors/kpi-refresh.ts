/**
 * M-12 · 11.5: once a day, every «أوتوماتيك» item of the current quarter's cards gets its number from the modules
 * (the catalog in @places/domain METRICS, 11.11). Read-only on the modules: it only writes KpiItem.value.
 * Idempotent: the numbers are recomputed from scratch and an item is written only when its number changed.
 * A metric whose source isn't built yet returns null and its item keeps «لسه» (UNBUILT below).
 */
import { prisma, type Prisma } from "@places/db";
import {
  type DealMoney, type DealStatus, type MetricParams, type Method, type WorkCalendar,
  type Nature, closedInSla, endOfLocalDay, fromDecimal, isTicketLate, pettyCapScore, rollUp, isWorkingDay, itemAchievement, localDate, onTimeShare, pct, perWeek, secondCallExcluded,
  kpiPeriodStart, salesAttendance, staleBefore, targetAchieved, timedTasks, timeliness,
} from "@places/domain";
import { workCalendar } from "../calendar.ts";

const day = (d: Date) => d.toISOString().slice(0, 10);
const MIN = 60_000, HOUR = 60 * MIN;
const NOT_DONE_DEAL = { notIn: ["REJECTED", "CANCELLED"] } as Prisma.EnumDealStatusFilter;
const STATUS: Record<string, DealStatus> = {
  PENDING_REVIEW: "Pending Review", APPROVED: "Approved", PARTIALLY_COLLECTED: "Partially Collected", FULLY_COLLECTED: "Fully Collected",
  REJECTED: "Rejected", CANCELLED: "Cancelled",
};

/**
 * Not measured here: no Broadcast log (4.x).
 * dailySum and webAds (the website ads count, 11.9: no website hook) are typed in the daily report, which writes them (11.12).
 */
export const UNBUILT = ["broadcasts", "dailySum", "webAds"];

interface Ctx { now: Date; quarter: string; qStart: Date; cal: WorkCalendar }
interface Who { id: string; userId: string; target: Prisma.Decimal }
type Measure = (c: Ctx, p: MetricParams, from: Date, who: Who) => Promise<number | null>;

/** A @db.Date column holds the Cairo day: compare it with that day, not the UTC instant. */
const dateOnly = (at: Date, c: Ctx) => new Date(`${localDate(at, c.cal)}T00:00:00Z`);
const avg = (p: MetricParams, n: number, from: Date, now: Date) => (p.avg === "week" ? perWeek(n, from, now) : n);
const verifiedAt = (v: Prisma.JsonValue): Date | null => {
  const at = v && typeof v === "object" && !Array.isArray(v) ? (v as { at?: unknown }).at : null;
  return typeof at === "string" ? new Date(at) : null;
};

/** The deals of the quarter as the commission rules read them (M-02). */
async function dealMoney(from: Date): Promise<DealMoney[]> {
  const deals = await prisma.deal.findMany({ where: { closedAt: { gte: from } }, include: { participants: true, payments: true } });
  return deals.map((d) => ({
    status: STATUS[d.status]!, commissionOwner: fromDecimal(d.commissionOwner.toFixed(2)), commissionClient: fromDecimal(d.commissionClient.toFixed(2)),
    payments: d.payments.map((x) => ({ side: x.side === "client" ? "client" : "owner", amount: fromDecimal(x.amount.toFixed(2)) })),
    buyers: d.participants.filter((x) => x.side === "BUYER").map((x) => x.employeeId),
    sellers: d.participants.filter((x) => x.side === "SELLER").map((x) => x.employeeId),
    sellerApproved: d.participants.filter((x) => x.side === "SELLER").every((x) => x.approved),
    targetBase: d.targetBase == null ? null : fromDecimal(d.targetBase.toFixed(2)), offTarget: d.offTarget,
  }));
}

/** Σ achieved ÷ Σ targets (commission shares, M-02) for these people, in percent. */
async function targetShare(c: Ctx, people: Array<{ id: string; target: Prisma.Decimal }>): Promise<number | null> {
  const goal = people.reduce((s, x) => s + fromDecimal(x.target.toFixed(2)), 0);
  if (!goal) return null;
  const deals = await dealMoney(c.qStart);
  const schemes = new Map((await prisma.employee.findMany({ select: { id: true, commissionPct: true } })).map((e) => [e.id, Number(e.commissionPct)]));
  const got = people.reduce((s, x) => s + targetAchieved(x.id, deals, (id) => schemes.get(id) ?? 0), 0);
  return pct(got, goal);
}

async function ticketsOnTime(c: Ctx, where: Prisma.TicketWhereInput) {
  const t = await prisma.ticket.findMany({ where: { createdAt: { gte: c.qStart }, ...where } });
  return onTimeShare(t.map((x) => (isTicketLate(x, c.now, c.cal) || (x.resolvedAt && !closedInSla(x, c.cal)) ? "late" : x.resolvedAt ? "ok" : "waiting")));
}

const available = (type?: "Resale"): Prisma.UnitWhereInput => ({
  archivedAt: null,
  OR: [{ status: "available", ...(type ? { type } : {}) }, { alsoStatus: "available", ...(type ? { alsoType: type } : {}) }],
});
async function fresh(c: Ctx, where: Prisma.UnitWhereInput) {
  const [all, ok] = await Promise.all([prisma.unit.count({ where }), prisma.unit.count({ where: { ...where, lastOwnerUpdateAt: { gte: staleBefore(c.now) } } })]);
  return pct(ok, all, 100);
}

/** 11.15 · the same rows the KPI card lists under the item (kpis.repository). */
async function newLeadTasks(from: Date, userId: string) {
  const l = await prisma.lead.findMany({
    where: { archivedAt: null, newLeadRequestedAt: { gte: from }, OR: [{ newLeadRoutedById: null }, { newLeadRoutedById: userId }] },
    select: { name: true, newLeadRequestedAt: true, newLeadRoutedAt: true },
  });
  return l.map((x) => ({ name: x.name, at: x.newLeadRequestedAt!, doneAt: x.newLeadRoutedAt }));
}
async function draftTasks(from: Date) {
  const d = await prisma.leadDraft.findMany({ where: { at: { gte: from } }, select: { kind: true, at: true, keptAt: true, decidedAt: true, lead: { select: { name: true } } } });
  // «يفضل» or sending it on, whichever came first, is the decision
  return d.map((x) => ({ name: x.lead.name, tag: x.kind === "admin" ? "Draft Admin" : "Draft", at: x.at, doneAt: x.keptAt ?? x.decidedAt }));
}

/** One function per catalog metric; `from` is the item's period start. */
const MEASURES: Record<string, Measure> = {
  // ── per person ──
  calls: async (c, p, from, who) => avg(p, await prisma.leadCall.count({ where: { byUserId: who.userId, at: { gte: from, lte: c.now } } }), from, c.now),
  visitsDone: async (c, p, from, who) => prisma.leadVisit.count({
    where: { outcome: "done", at: { gte: from, lte: c.now }, lead: { assignedToId: who.id }, ...(p.kind ? { kind: String(p.kind).toLowerCase() } : {}) },
  }),
  unitsBrought: async (c, p, from, who) => prisma.unit.count({ where: { agentId: who.id, enteredAt: { gte: from }, ...(p.type ? { type: p.type as "Rent" } : {}) } }),
  firstAction: async (c, p, from, who) => {
    const limit = (Number(p.min) || 30) * MIN;
    const leads = await prisma.lead.findMany({ where: { assignedToId: who.id, arrivedAt: { gte: from } }, select: { arrivedAt: true, firstActionAt: true } });
    return onTimeShare(leads.map((l) => timeliness(l.firstActionAt, new Date(l.arrivedAt.getTime() + limit), c.now)));
  },
  qualifiedRate: async (c, p, from, who) => {
    const where = { assignedToId: who.id, createdAt: { gte: from } };
    const [all, q] = await Promise.all([prisma.lead.count({ where }), prisma.lead.count({ where: { ...where, qualified: true } })]);
    return pct(q, all, 0);
  },
  activitiesDone: async (c, p, from, who) => avg(p, await prisma.salesActivity.count({
    // counted on the day it happened, not the day it was reported (demo)
    where: { employeeId: who.id, status: "done", at: { gte: from, lte: c.now }, ...(p.akind ? { kind: String(p.akind) } : {}) },
  }), from, c.now),
  dealsCount: async (c, p, from, who) => prisma.deal.count({ where: { status: NOT_DONE_DEAL, closedAt: { gte: from }, participants: { some: { employeeId: who.id, side: "BUYER" } } } }),
  ownTarget: async (c, p, from, who) => targetShare(c, [who]),
  teamTarget: async (c, p, from, who) => targetShare(c, await prisma.employee.findMany({ where: { OR: [{ teamLeaderId: who.id }, { id: who.id }] }, select: { id: true, target: true } })),
  att: async (c, p, from, who) => {
    const days = await prisma.attendanceDay.findMany({ where: { employeeId: who.id, day: { gte: dateOnly(c.qStart, c) } }, select: { deduction: true } });
    return pct(days.filter((d) => Number(d.deduction) === 0).length, days.length);
  },
  attSales: async (c, p, from, who) => {
    const month = localDate(c.now, c.cal).slice(0, 7);
    const days = await prisma.attendanceDay.findMany({ where: { employeeId: who.id, day: { gte: dateOnly(c.qStart, c) } }, select: { day: true, kind: true, lateMinutes: true } });
    if (!days.length) return null;
    const late = days.filter((d) => day(d.day).startsWith(month)).reduce((s, d) => s + d.lateMinutes, 0);
    return salesAttendance(days.filter((d) => d.kind === "ABSENT").length, late / 60);
  },
  // ── company-wide ──
  company: async (c) => targetShare(c, await prisma.employee.findMany({ where: { target: { gt: 0 } }, select: { id: true, target: true } })),
  secondCalls: async (c, p, from) => {
    const leads = await prisma.lead.findMany({
      where: { createdAt: { gte: from }, archivedAt: null, selfEntered: false, ownedByTelesales: false, channel: { notIn: secondCallExcluded(p) } },
      select: { createdAt: true, verification: true },
    });
    return onTimeShare(leads.map((l) => timeliness(verifiedAt(l.verification), endOfLocalDay(l.createdAt, c.cal), c.now)));
  },
  // 11.15: the requests this person routed, and the ones still waiting (demo newLeadReqs)
  newLeadRoute: async (c, p, from, who) => timedTasks(await newLeadTasks(from, who.userId), (Number(p.min) || 30) * MIN, c.now, "min").value,
  draftAction: async (c, p, from) => timedTasks(await draftTasks(from), (Number(p.hours) || 24) * HOUR, c.now, "hour").value,
  call30: async (c) => {
    const leads = await prisma.lead.findMany({ where: { arrivedAt: { gte: c.qStart } }, select: { arrivedAt: true, firstCallAt: true } });
    return onTimeShare(leads.map((l) => timeliness(l.firstCallAt, new Date(l.arrivedAt.getTime() + 30 * MIN), c.now)));
  },
  qualifiedN: async (c) => prisma.lead.count({ where: { qualified: true, createdAt: { gte: c.qStart } } }),
  outbound: async (c) => prisma.company.count({ where: { outbound: true, createdAt: { gte: kpiPeriodStart("week", c.now, c.quarter) } } }),
  big500: async (c, p, from) => {
    const [deals, leads] = await Promise.all([
      prisma.deal.count({ where: { status: NOT_DONE_DEAL, space: { gte: 500 }, closedAt: { gte: from } } }),
      prisma.lead.count({ where: { qualified: true, space: { gte: 500 }, createdAt: { gte: from } } }),
    ]);
    return pct(deals, leads);
  },
  dealExec: async (c) => {
    // execDueAt is a Cairo calendar day (stored at 00:00 UTC): compare by Cairo day, or a deal due «today» isn't counted
    // between midnight Cairo and midnight UTC
    const due = await prisma.deal.findMany({ where: { status: NOT_DONE_DEAL, execDueAt: { lte: dateOnly(c.now, c) } }, select: { execDueAt: true, executedAt: true, commissionOwner: true, commissionClient: true } });
    const value = (d: (typeof due)[number]) => fromDecimal(d.commissionOwner.toFixed(2)) + fromDecimal(d.commissionClient.toFixed(2));
    return pct(due.filter((d) => d.executedAt && d.executedAt <= d.execDueAt!).reduce((s, d) => s + value(d), 0), due.reduce((s, d) => s + value(d), 0));
  },
  paperErrors: async (c) => prisma.deal.count({ where: { papersOk: false, closedAt: { gte: c.qStart } } }),
  verified: async (c) => fresh(c, available()),
  resaleFresh: async (c) => fresh(c, available("Resale")),
  in24: async (c, p) => {
    const u = await prisma.unit.findMany({ where: { receivedAt: { not: null }, enteredAt: { gte: c.qStart }, ...(p.type ? { type: p.type as "Rent" } : {}) }, select: { receivedAt: true, enteredAt: true } });
    return pct(u.filter((x) => x.enteredAt.getTime() - x.receivedAt!.getTime() <= 24 * HOUR).length, u.length);
  },
  drive24: async (c) => {
    const u = await prisma.unit.findMany({ where: { enteredAt: { gte: c.qStart } }, select: { enteredAt: true, mediaUploadedAt: true } });
    return onTimeShare(u.map((x) => timeliness(x.mediaUploadedAt, new Date(x.enteredAt.getTime() + 24 * HOUR), c.now)), null);
  },
  lists24: async (c) => {
    const l = await prisma.listRequest.findMany({ where: { createdAt: { gte: c.qStart } }, select: { createdAt: true, doneAt: true } });
    return onTimeShare(l.map((x) => timeliness(x.doneAt, new Date(x.createdAt.getTime() + 24 * HOUR), c.now)), null);
  },
  listsClean: async (c) => {
    const l = await prisma.listRequest.findMany({ where: { createdAt: { gte: c.qStart }, doneAt: { not: null } }, select: { unconfirmed: true } });
    return pct(l.filter((x) => x.unconfirmed === 0).length, l.length);
  },
  tickets: async (c) => ticketsOnTime(c, { type: { not: "dispute" } }),
  disputes: async (c) => ticketsOnTime(c, { type: "dispute" }),
  proc48: async (c) => {
    const p = await prisma.purchase.findMany({ where: { createdAt: { gte: c.qStart }, settledAt: { not: null } }, select: { createdAt: true, settledAt: true } });
    return pct(p.filter((x) => x.settledAt!.getTime() - x.createdAt.getTime() <= 48 * HOUR).length, p.length);
  },
  receipts: async (c) => {
    const p = await prisma.purchase.findMany({ where: { createdAt: { gte: c.qStart }, amount: { gt: 10_000 }, status: { not: "Rejected" } }, select: { attachments: true } });
    return pct(p.filter((x) => x.attachments.length > 0).length, p.length, 100);
  },
  // M-08 3.1: each capped safe's live balance (the ledger's own roll-up, as the API's LedgerService.balances) vs its ceiling
  pettyCap: async () => {
    const [accounts, sums] = await Promise.all([
      prisma.account.findMany({ where: { archivedAt: null }, select: { id: true, parentId: true, nature: true, cap: true } }),
      prisma.journalLine.groupBy({ by: ["accountId"], _sum: { debit: true, credit: true } }),
    ]);
    const money = (d: Prisma.Decimal | null) => (d ? fromDecimal(d.toFixed(2)) : 0);
    const balance = rollUp(accounts.map((a) => ({ id: a.id, parentId: a.parentId, nature: a.nature as Nature })),
      new Map(sums.map((x) => [x.accountId, { debit: money(x._sum.debit), credit: money(x._sum.credit) }])));
    return pettyCapScore(accounts.filter((a) => a.cap != null).map((a) => ({ balance: balance.get(a.id) ?? 0, cap: money(a.cap) })));
  },
};
/** Company-wide metrics are the same on every card: measured once per run and settings. */
const PER_PERSON = new Set(["newLeadRoute", "calls", "visitsDone", "unitsBrought", "firstAction", "qualifiedRate", "activitiesDone", "dealsCount", "ownTarget", "teamTarget", "att", "attSales"]);

/** `only`: write just these people's cards (a test, or re-running one person); everything is still measured for «team». */
export async function kpiRefreshTick(now = new Date(), only?: readonly string[]): Promise<number> {
  const cal = await workCalendar();
  // a Friday or a holiday adds nothing new: the next working day's run counts it
  if (!isWorkingDay(localDate(now, cal), cal)) return 0;
  const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  if (!q || q.status !== "open") return 0;
  const c: Ctx = { now, quarter: q.id, qStart: kpiPeriodStart("quarter", now, q.id, cal), cal };

  const cards = await prisma.kpiCard.findMany({
    where: { quarter: q.id },
    include: { employee: { select: { id: true, userId: true, target: true } }, items: { include: { _count: { select: { deliveries: true } } } } },
  });
  const shared = new Map<string, Promise<number | null>>();
  const fresh = new Map<string, number>(); // item id → today's number
  for (const card of cards) {
    for (const it of card.items) {
      const m = it.method === "system" && it.metric ? MEASURES[it.metric] : undefined;
      if (!m) continue;
      const p = (it.params ?? {}) as MetricParams;
      const run = () => m(c, p, kpiPeriodStart(p.per, now, q.id, cal), card.employee);
      const key = `${it.metric}:${JSON.stringify(p)}`;
      if (!PER_PERSON.has(it.metric!) && !shared.has(key)) shared.set(key, run());
      const v = PER_PERSON.has(it.metric!) ? await run() : await shared.get(key)!;
      if (v != null) fresh.set(it.id, Math.round(v * 100) / 100);
    }
  }
  // «متوسط كروت فريقه»: the cards this person follows, with today's numbers (a follower's own team item uses yesterday's)
  const score = (cd: (typeof cards)[number]) => cd.items.reduce((s, it) => s + it.weight * itemAchievement({
    method: it.method as Method, direction: it.direction as "at-least", goal: Number(it.goal), value: fresh.get(it.id) ?? (it.value == null ? null : Number(it.value)),
    required: it.required, delivered: it._count.deliveries,
  }), 0);
  for (const card of cards) {
    const followed = cards.filter((x) => x.followerId === card.employeeId);
    for (const it of card.items.filter((x) => x.method === "system" && x.metric === "team" && followed.length)) {
      fresh.set(it.id, Math.round((followed.reduce((s, x) => s + score(x), 0) / followed.length) * 100) / 100);
    }
  }

  const changed = cards.filter((cd) => !only || only.includes(cd.employeeId)).flatMap((cd) => cd.items)
    .filter((it) => fresh.has(it.id) && (it.value == null || Number(it.value) !== fresh.get(it.id)));
  if (!changed.length) return 0;
  await prisma.$transaction(async (tx) => {
    for (const it of changed) await tx.kpiItem.update({ where: { id: it.id }, data: { value: fresh.get(it.id)! } });
    await tx.auditLog.create({ data: { module: "kpis", entity: "KpiItem", entityId: q.id, action: "refresh",
      after: { items: changed.map((it) => ({ id: it.id, before: it.value == null ? null : Number(it.value), after: fresh.get(it.id) })), summary: `السيستم حدّث ${changed.length} بند أوتوماتيك من الموديولات` } } });
  });
  return changed.length;
}
