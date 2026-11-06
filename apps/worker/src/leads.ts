/**
 * What the lead jobs (SLA 1.16, No Answer 1.17, Draft 1.26…) share: «قواعد الليدز» (1.29) with their defaults, the
 * official holidays as days, and telling the people a rule names. The worker has no Nest services, so this is the
 * worker's side of LeadRulesService and NotificationsService.
 */
import { prisma, type Prisma } from "@places/db";
import { type LeadRules, type RuleWho, eventByKey, holidayDays, ruleRecipients, withRuleDefaults } from "@places/domain";
import { pushOnChannels } from "./push.ts";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function leadRules(): Promise<LeadRules> {
  return withRuleDefaults((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value);
}

/** Every day of every official holiday range («من … لحد …», 1.29). */
export async function officialHolidays(): Promise<Set<string>> {
  return holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
}

// The rotation (lockRouting, areaPool in the day's order, 1.23) is shared with the API: @places/db routing.ts.

export interface LeadOwner { readonly name: string; readonly userId: string; readonly tlUserId: string | null }

/** The salesperson (employee id) with their account and their Team Leader's, for «owner» / «ownerTl» in a rule. */
export async function ownerOf(employeeId: string | null, tx: Prisma.TransactionClient = prisma): Promise<LeadOwner | null> {
  if (!employeeId) return null;
  const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { name: true, userId: true, teamLeader: { select: { userId: true } } } });
  return e ? { name: e.name, userId: e.userId, tlUserId: e.teamLeader?.userId ?? null } : null;
}

/** Who a rule told, and the phone copy — sent by the caller once its transaction committed (push.ts). */
export interface Told { readonly userIds: string[]; push(): Promise<number> }

/**
 * Tells the people a rule names (roles and people, «owner» / «ownerTl» of this lead), active accounts only, never
 * twice, on the rule's channels: in-app (`important` ones stay until read), email queued for the mail-outbox job
 * (M-14 2.4) — skipped for someone who turned email off, unless important — and push (12.10), titled like the API's
 * event for the same thing (`event`). Returns who was told.
 */
export async function tellRule(tx: Prisma.TransactionClient, who: RuleWho, owner: LeadOwner | null, n: { text: string; link: string; important: boolean; subject?: string; event?: string }): Promise<Told> {
  const told = (userIds: string[]): Told => ({
    userIds,
    push: () => pushOnChannels(who.ch, n.important, (n.event && eventByKey(n.event)?.label) || n.subject || "الليدز", { userIds, text: n.text, link: n.link }),
  });
  const to = ruleRecipients(who, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.tlUserId ?? null });
  if (!to.length || !who.ch.length) return told([]);
  const people = await tx.user.findMany({
    where: { status: "ACTIVE", OR: [{ id: { in: to } }, { roles: { some: { role: { key: { in: to } } } } }] },
    select: { id: true, email: true, emailNotifications: true },
  });
  if (who.ch.includes("app")) await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, event: n.event ?? null, text: n.text, link: n.link, important: n.important })) });
  const mail = who.ch.includes("email") ? people.filter((p) => p.emailNotifications || n.important) : [];
  if (mail.length) await tx.mailLog.createMany({ data: mail.map((p) => ({ to: p.email, subject: `${n.subject ?? "الليدز"} · Places ERP`, text: `${n.text}\n${process.env.WEB_ORIGIN ?? ""}${n.link}` })) });
  return told(people.map((p) => p.id));
}
