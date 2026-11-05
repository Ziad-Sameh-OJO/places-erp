/**
 * 1.26 · 4 Nov meeting: a lead nobody acted on or commented on for draft.days (7), or draft.holdDays (14) on Hold,
 * leaves its salesperson for the Draft tab, where only the people of draft.see (Operations) see it and decide. The
 * people of draft.notify are told (Operations and the salesperson by default). The rule is draftStep() in
 * @places/domain. Idempotent: the move is claimed on the same assignment (draft null, same salesperson) in the same
 * transaction as its LeadDraft row, Activity, audit and notification.
 */
import { prisma } from "@places/db";
import { DRAFT_SKIP, type LeadRules, type LeadStage, LEAD_STAGES, draftStep } from "@places/domain";
import { leadRules, ownerOf, tellRule } from "../leads.ts";

const toDb = (s: LeadStage) => s.toUpperCase().replace(/ /g, "_");
const STAGE = new Map<string, LeadStage>(LEAD_STAGES.map((s) => [toDb(s), s]));

/** `pinned`: the saved «قواعد الليدز» unless given (the e2e pins them, so another test changing them can't move its clock). */
export async function draftTick(now = new Date(), pinned?: LeadRules): Promise<number> {
  const rules = pinned ?? (await leadRules());
  if (!rules.draft.on) return 0;
  const leads = await prisma.lead.findMany({
    where: { draft: null, archivedAt: null, ownedByTelesales: false, assignedToId: { not: null }, stage: { notIn: DRAFT_SKIP.map(toDb) as never } },
    select: { id: true, code: true, name: true, stage: true, assignedToId: true, assignedAt: true, createdAt: true,
      activities: { where: { byUserId: { not: null } }, select: { at: true }, orderBy: { at: "desc" }, take: 1 } },
  });
  let moved = 0;
  for (const l of leads) {
    // the last touch: when it reached the salesperson, or a person's own action / comment since (demo lastTouch)
    const lastTouch = [l.assignedAt, l.createdAt, l.activities[0]?.at].filter((d): d is Date => !!d).reduce((a, b) => (b > a ? b : a));
    const stage = STAGE.get(l.stage)!;
    const days = draftStep({ stage, lastTouch }, now, rules);
    if (days === null || lastTouch > now) continue;
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.lead.updateMany({ where: { id: l.id, draft: null, assignedToId: l.assignedToId, stage: l.stage, archivedAt: null }, data: { draft: "draft", assignedToId: null } });
      if (!claimed.count) return false;
      const from = await ownerOf(l.assignedToId, tx);
      await tx.leadDraft.create({ data: { leadId: l.id, kind: "draft", at: now, fromId: l.assignedToId, stage: l.stage, days } });
      await tx.leadActivity.create({ data: { leadId: l.id, kind: "assign", byUserId: null,
        text: `اتسحب أوتوماتيك من ${from?.name ?? "—"} للـ Draft بعد ${days} يوم من غير أكشن${stage === "Hold" ? " (Hold)" : ""}` } });
      await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: l.id, action: "to-draft", userId: null,
        before: { assignedToId: l.assignedToId, draft: null }, after: { assignedToId: null, draft: "draft", days } } });
      await tellRule(tx, rules.draft.notify, from, { text: `${l.name} (${l.code}) اتسحب من ${from?.name ?? "—"} للـ Draft · ${days} يوم من غير أكشن`, link: `/leads?open=${l.id}`, important: false });
      return true;
    });
    if (done) moved++;
  }
  return moved;
}
