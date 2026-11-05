/**
 * 1.17 · M-01 Q5, 2.3 + 4 Nov meeting: a lead its salesperson marked No Answer moves on noAnswer.hours (24) after the
 * mark: to the next salesperson of the area as Fresh (who must try and mark it too before it moves again; if they do
 * nothing, the SLA job takes it), and on the rotation the rules name (3rd) to Telesales. The rule is noAnswerStep()
 * in @places/domain. Idempotent: the move is claimed on the same mark (stage, salesperson, naMarkedAt) in the same
 * transaction as its Activity, audit and notification, so a rerun or the salesperson acting meanwhile wins.
 */
import { prisma, type Prisma } from "@places/db";
import { LeadRouter, type LeadRules, OWNER, durationText, localDate, noAnswerStep } from "@places/domain";
import { leadRules, lockRouting, ownerOf, routingPool, saveRouting, tellRule } from "../leads.ts";

const TELESALES = "telesales"; // role key (seed-data/roles.json)

interface Lead { id: string; code: string; name: string; area: string; assignedToId: string | null; naMarkedAt: Date | null; rotation: number }

/** `pinned`: the saved «قواعد الليدز» unless given (the e2e pins them, so another test changing them can't move its clock). */
export async function noAnswerTick(now = new Date(), pinned?: LeadRules): Promise<{ next: number; telesales: number }> {
  const done = { next: 0, telesales: 0 };
  const rules = pinned ?? (await leadRules());
  const marked = await prisma.lead.findMany({
    where: { stage: "NO_ANSWER", ownedByTelesales: false, archivedAt: null, assignedToId: { not: null }, naMarkedAt: { lte: new Date(now.getTime() - rules.noAnswer.hours * 3_600_000) } },
    select: { id: true, code: true, name: true, area: true, assignedToId: true, naMarkedById: true, naMarkedAt: true, rotation: true },
  });
  for (const lead of marked) {
    const step = noAnswerStep(lead, now, rules);
    if (step === "next" && (await toNextSalesperson(lead, rules, now))) done.next++;
    if (step === "telesales" && (await toTelesales(lead, rules, now))) done.telesales++;
  }
  return done;
}

/** Demo: «No Answer: عدّى 24 ساعة عند فلان وراح لـ فلان (رجع Fresh)», and the new salesperson is told. */
async function toNextSalesperson(lead: Lead, rules: LeadRules, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const router = new LeadRouter(await lockRouting(tx));
    const next = router.next(lead.area, await routingPool(tx, lead.area, lead.assignedToId, localDate(now)));
    if (!next) return false; // nobody else covers the area: it waits with its salesperson
    if (!(await move(tx, lead, { assignedToId: next, ownedByTelesales: false }, now))) return false;
    await saveRouting(tx, router.snapshot());
    const [from, to] = await Promise.all([ownerOf(lead.assignedToId, tx), ownerOf(next, tx)]);
    await record(tx, lead, `No Answer: عدّى ${durationText(rules.noAnswer.hours * 60)} عند ${from?.name ?? "—"} وراح لـ ${to?.name ?? "—"} (رجع Fresh)`, next, "next");
    await tellRule(tx, { to: [OWNER], ch: rules.newLead.ch }, to, { text: `ليد ${lead.name} جالك بعد No Answer عند ${from?.name ?? "—"}`, link: link(lead), important: false });
    return true;
  });
}

/** Demo: «الروتيشن رقم 3: الليد راح لـ Telesales (فلانة)», and noAnswer.notify is told. Telesales keeps it: no SLA. */
async function toTelesales(lead: Lead, rules: LeadRules, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const telesales = await telesalesOf(tx, rules);
    if (!telesales) return false;
    if (!(await move(tx, lead, { assignedToId: telesales.id, ownedByTelesales: true }, now))) return false;
    const owner = await ownerOf(telesales.id, tx);
    await record(tx, lead, `الروتيشن رقم ${lead.rotation + 1}: الليد راح لـ Telesales (${telesales.name})`, telesales.id, "telesales");
    await tellRule(tx, rules.noAnswer.notify, owner, { text: `ليد ${lead.name} رجعلك في الروتيشن التالت`, link: link(lead), important: false });
    return true;
  });
}

/** The move itself, only if it is still the same No Answer mark; a fresh start with the new holder. */
async function move(tx: Prisma.TransactionClient, lead: Lead, to: { assignedToId: string; ownedByTelesales: boolean }, now: Date): Promise<boolean> {
  const moved = await tx.lead.updateMany({
    where: { id: lead.id, stage: "NO_ANSWER", assignedToId: lead.assignedToId, naMarkedAt: lead.naMarkedAt, archivedAt: null },
    data: { ...to, assignedAt: now, stage: "FRESH", touched: false, firstActionAt: null, slaWarnedAt: null, naMarkedAt: null, naMarkedById: null, rotation: { increment: 1 } },
  });
  return moved.count === 1;
}

async function record(tx: Prisma.TransactionClient, lead: Lead, text: string, to: string, kind: "next" | "telesales") {
  await tx.leadActivity.create({ data: { leadId: lead.id, kind: "assign", text, byUserId: null } });
  await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: lead.id, action: "no-answer-rotate", userId: null,
    before: { assignedToId: lead.assignedToId, stage: "NO_ANSWER", rotation: lead.rotation }, after: { assignedToId: to, stage: "FRESH", rotation: lead.rotation + 1, to: kind } } });
}

/**
 * «الـ Telesales اللي بيستلم» from the rules (a user id); none chosen → the first person with the Telesales role (the
 * demo's Hadeer). Only someone still working here.
 */
async function telesalesOf(tx: Prisma.TransactionClient, rules: LeadRules): Promise<{ id: string; name: string } | null> {
  const active = { user: { status: { not: "DISABLED" as const }, roles: { some: { role: { key: TELESALES } } } } };
  return tx.employee.findFirst({
    where: rules.noAnswer.telesales ? { ...active, userId: rules.noAnswer.telesales } : active,
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

const link = (lead: Lead) => `/leads?open=${lead.id}`;
