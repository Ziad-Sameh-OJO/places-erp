/**
 * What the lead jobs (SLA 1.16, No Answer 1.17, Draft 1.26…) share: «قواعد الليدز» (1.29) with their defaults, the
 * official holidays as days, and telling the people a rule names. The worker has no Nest services, so this is the
 * worker's side of LeadRulesService and NotificationsService (in-app only: the worker has no mail service yet).
 */
import { prisma, type Prisma } from "@places/db";
import { type LeadRules, type RuleWho, holidayDays, ruleRecipients, withRuleDefaults } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function leadRules(): Promise<LeadRules> {
  return withRuleDefaults((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value);
}

/** Every day of every official holiday range («من … لحد …», 1.29). */
export async function officialHolidays(): Promise<Set<string>> {
  return holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
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
 * twice. In-app when the rule has the app channel; `important` ones stay until read (M-14). Returns who was told.
 */
export async function tellRule(tx: Prisma.TransactionClient, who: RuleWho, owner: LeadOwner | null, n: { text: string; link: string; important: boolean }): Promise<string[]> {
  if (!who.ch.includes("app")) return [];
  const to = ruleRecipients(who, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.tlUserId ?? null });
  if (!to.length) return [];
  const people = await tx.user.findMany({
    where: { status: "ACTIVE", OR: [{ id: { in: to } }, { roles: { some: { role: { key: { in: to } } } } }] },
    select: { id: true },
  });
  await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, text: n.text, link: n.link, important: n.important })) });
  return people.map((p) => p.id);
}
