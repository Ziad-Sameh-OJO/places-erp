/**
 * 1.16 · M-01 SLA (Q4, 2.4): an untouched Fresh lead warns the people of «قواعد الليدز» sla.warn once, then is pulled
 * to the next salesperson of its area and the people of sla.pull are told. Times, working hours and the on / off
 * switch come from the rules (1.29), the official holidays are ranges; the rule itself is slaStep() in @places/domain.
 * Idempotent: the warning is claimed with slaWarnedAt and the pull with the lead's assignment (assignedToId +
 * assignedAt), each in the same transaction as what it sends, so a rerun or a parallel action never repeats them.
 */
import { prisma } from "@places/db";
import { LeadRouter, type LeadRules, durationText, isHolidayNow, localDate, slaStep } from "@places/domain";
import { type Told, leadRules, lockRouting, officialHolidays, ownerOf, routingPool, saveRouting, tellRule } from "../leads.ts";

interface Lead { id: string; code: string; name: string; area: string; assignedToId: string | null; assignedAt: Date }

/** `pinned`: the saved «قواعد الليدز» unless given (the e2e pins them, so another test changing them meanwhile can't move its clock). */
export async function leadSlaTick(now = new Date(), pinned?: LeadRules): Promise<{ warned: number; pulled: number }> {
  const done = { warned: 0, pulled: 0 };
  const rules = pinned ?? (await leadRules());
  if (!rules.sla.on) return done;
  const holidays = await officialHolidays();
  const fresh = await prisma.lead.findMany({
    where: { stage: "FRESH", touched: false, ownedByTelesales: false, assignedToId: { not: null }, assignedAt: { not: null }, archivedAt: null },
    select: { id: true, code: true, name: true, area: true, assignedToId: true, assignedAt: true, slaWarnedAt: true },
  });
  for (const l of fresh) {
    const lead = { ...l, assignedAt: l.assignedAt! };
    const step = slaStep({ assignedAt: lead.assignedAt, warned: !!l.slaWarnedAt }, now, rules, holidays);
    const warned = step === "warn" ? await warn(lead, rules, now) : null;
    const pulled = step === "pull" ? await pull(lead, rules, now, isHolidayNow(rules, now, holidays)) : null;
    if (warned) done.warned++;
    if (pulled) done.pulled++;
    await (warned ?? pulled)?.push();
  }
  return done;
}

/** «تنبيه SLA» (demo wording), once per assignment: only if the lead is still untouched with the same salesperson. */
async function warn(lead: Lead, rules: LeadRules, now: Date): Promise<Told | null> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.lead.updateMany({ where: { ...untouched(lead), slaWarnedAt: null }, data: { slaWarnedAt: now } });
    if (!claimed.count) return null;
    const owner = await ownerOf(lead.assignedToId, tx);
    return tellRule(tx, rules.sla.warn, owner, { text: `تنبيه SLA: ${lead.name} (${lead.code}) من غير أكشن عند ${owner?.name ?? "—"}`, link: link(lead), important: true, event: "lead.sla_warn" });
  });
}

/**
 * The pull: the next salesperson of the area's rotation (not the one who had it, nobody on leave), a fresh SLA clock,
 * the Activity and the audit, then the people of sla.pull are told. Nobody else covers the area → it stays (Operations
 * sees it red).
 */
async function pull(lead: Lead, rules: LeadRules, now: Date, holiday: boolean): Promise<Told | null> {
  return prisma.$transaction(async (tx) => {
    const router = new LeadRouter(await lockRouting(tx));
    const next = router.next(lead.area, await routingPool(tx, lead.area, lead.assignedToId, localDate(now)));
    if (!next) return null;
    // optimistic: a salesperson's action or a hand reassignment meanwhile wins, and the rotation keeps its turn
    const moved = await tx.lead.updateMany({ where: untouched(lead), data: { assignedToId: next, assignedAt: now, slaWarnedAt: null } });
    if (!moved.count) return null;
    await saveRouting(tx, router.snapshot());
    const [from, to] = await Promise.all([ownerOf(lead.assignedToId, tx), ownerOf(next, tx)]);
    const after = durationText(holiday ? rules.sla.holPullMin : rules.sla.pullMin);
    await tx.leadActivity.create({ data: { leadId: lead.id, kind: "assign", text: `اتسحب أوتوماتيك من ${from?.name ?? "—"} بعد ${after} من غير أكشن، وراح لـ ${to?.name ?? "—"}`, byUserId: null } });
    await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: lead.id, action: "auto-pull", userId: null,
      before: { assignedToId: lead.assignedToId, assignedAt: lead.assignedAt.toISOString() }, after: { assignedToId: next, assignedAt: now.toISOString() } } });
    return tellRule(tx, rules.sla.pull, from, { text: `الليد ${lead.code} (${lead.name}) اتسحب من ${from?.name ?? "—"} وراح لـ ${to?.name ?? "—"}`, link: link(lead), important: true, event: "lead.pulled" });
  });
}

/** Still the same untouched Fresh assignment the job looked at. */
const untouched = (lead: Lead) => ({ id: lead.id, assignedToId: lead.assignedToId, assignedAt: lead.assignedAt, stage: "FRESH" as const, touched: false, ownedByTelesales: false, archivedAt: null });
const link = (lead: Lead) => `/leads?open=${lead.id}`;

