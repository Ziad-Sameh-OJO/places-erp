/**
 * What the lead jobs (SLA 1.16, No Answer 1.17, Draft 1.26…) share: «قواعد الليدز» (1.29) with their defaults, the
 * official holidays as days, and telling the people a rule names. The worker has no Nest services, so this is the
 * worker's side of LeadRulesService and NotificationsService (in-app only: the worker has no mail service yet).
 */
import { prisma, type Prisma } from "@places/db";
import { type LeadRules, type RoutingState, type RuleWho, holidayDays, ruleRecipients, withRuleDefaults } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function leadRules(): Promise<LeadRules> {
  return withRuleDefaults((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value);
}

/** Every day of every official holiday range («من … لحد …», 1.29). */
export async function officialHolidays(): Promise<Set<string>> {
  return holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
}

/** Leave that keeps someone out of the rotation: approved by the TL or closed by HR (leaves.service COUNTED, 1.15). */
const ON_LEAVE = ["APPROVED_BY_TL", "CLOSED_BY_HR"] as const;

/** The rotation, locked like the API does when it creates a lead: a pull and a new lead at once both keep their turn. */
export async function lockRouting(tx: Prisma.TransactionClient): Promise<RoutingState> {
  await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES ('routing', '{"cursor":{},"skipTurns":{}}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
  const [row] = await tx.$queryRaw<Array<{ value: RoutingState }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = 'routing' FOR UPDATE`;
  return { cursor: {}, skipTurns: {}, ...row?.value };
}

export function saveRouting(tx: Prisma.TransactionClient, state: RoutingState) {
  return tx.setting.update({ where: { key: "routing" }, data: { value: state as never } });
}

/**
 * Who may get a lead of `area` now, in rotation order, like the API's new lead: the area's salespeople minus `except`
 * (the one it leaves), anyone whose account was switched off (1.13) and anyone on approved leave today (1.15).
 */
export async function routingPool(tx: Prisma.TransactionClient, area: string, except: string | null, today: string): Promise<string[]> {
  const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
  const ids = (pools[area] ?? []).filter((id) => id !== except);
  const [active, away] = await Promise.all([
    tx.employee.findMany({ where: { id: { in: ids }, user: { status: { not: "DISABLED" } } }, select: { id: true } }),
    tx.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: { in: [...ON_LEAVE] }, fromDay: { lte: new Date(`${today}T00:00:00Z`) }, toDay: { gte: new Date(`${today}T00:00:00Z`) } }, select: { employeeId: true } }),
  ]);
  const ok = new Set(active.map((e) => e.id)), off = new Set(away.map((r) => r.employeeId));
  return ids.filter((id) => ok.has(id) && !off.has(id));
}

export interface LeadOwner { readonly name: string; readonly userId: string; readonly tlUserId: string | null }

/** The salesperson (employee id) with their account and their Team Leader's, for «owner» / «ownerTl» in a rule. */
export async function ownerOf(employeeId: string | null, tx: Prisma.TransactionClient = prisma): Promise<LeadOwner | null> {
  if (!employeeId) return null;
  const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { name: true, userId: true, teamLeader: { select: { userId: true } } } });
  return e ? { name: e.name, userId: e.userId, tlUserId: e.teamLeader?.userId ?? null } : null;
}

/**
 * Tells the people a rule names (roles and people, «owner» / «ownerTl» of this lead), active accounts only, never
 * twice, on the rule's channels: in-app (`important` ones stay until read), and email queued for the mail-outbox job
 * (M-14 2.4) — skipped for someone who turned email off, unless important. Returns who was told.
 */
export async function tellRule(tx: Prisma.TransactionClient, who: RuleWho, owner: LeadOwner | null, n: { text: string; link: string; important: boolean; subject?: string }): Promise<string[]> {
  const to = ruleRecipients(who, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.tlUserId ?? null });
  if (!to.length || !(who.ch.includes("app") || who.ch.includes("email"))) return [];
  const people = await tx.user.findMany({
    where: { status: "ACTIVE", OR: [{ id: { in: to } }, { roles: { some: { role: { key: { in: to } } } } }] },
    select: { id: true, email: true, emailNotifications: true },
  });
  if (who.ch.includes("app")) await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, text: n.text, link: n.link, important: n.important })) });
  const mail = who.ch.includes("email") ? people.filter((p) => p.emailNotifications || n.important) : [];
  if (mail.length) await tx.mailLog.createMany({ data: mail.map((p) => ({ to: p.email, subject: `${n.subject ?? "الليدز"} · Places ERP`, text: `${n.text}\n${process.env.WEB_ORIGIN ?? ""}${n.link}` })) });
  return people.map((p) => p.id);
}
