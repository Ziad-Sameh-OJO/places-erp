/**
 * 1.18 · M-01 Q5: «كل 4 ساعات يجي للسيلز Alarm يكلّم الليدز اللي عامل عليهم No Answer». Every noAnswer.remindH working
 * hours (from «قواعد الليدز») since the mark, the last logged call or the last Alarm, the lead's salesperson is told
 * (event lead.no_answer). The rule is noAnswerReminderDue() in @places/domain. Idempotent: the Alarm is claimed with
 * naRemindedAt on the value the job read, in the same transaction as the notification.
 */
import { prisma } from "@places/db";
import { type LeadRules, eventByKey, noAnswerReminderDue } from "@places/domain";
import { leadRules, officialHolidays, ownerOf } from "../leads.ts";
import { pushEvent } from "../push.ts";

/** `pinned`: the saved «قواعد الليدز» unless given (the e2e pins them, so another test changing them can't move its clock). */
export async function noAnswerReminderTick(now = new Date(), pinned?: LeadRules): Promise<number> {
  const rules = pinned ?? (await leadRules());
  const holidays = await officialHolidays();
  const leads = await prisma.lead.findMany({
    where: { stage: "NO_ANSWER", archivedAt: null, assignedToId: { not: null }, naMarkedAt: { not: null, lte: now } },
    select: { id: true, name: true, assignedToId: true, naMarkedAt: true, naRemindedAt: true, calls: { select: { at: true }, orderBy: { at: "desc" }, take: 1 } },
  });
  const important = eventByKey("lead.no_answer")?.important ?? false;
  let sent = 0;
  for (const l of leads) {
    if (!noAnswerReminderDue({ naMarkedAt: l.naMarkedAt, lastCallAt: l.calls[0]?.at ?? null, remindedAt: l.naRemindedAt }, now, rules, holidays)) continue;
    const text = `Alarm: كلّم ${l.name} (No Answer) · سجّل المكالمة`, link = `/leads?open=${l.id}`;
    const told = await prisma.$transaction(async (tx) => {
      const claimed = await tx.lead.updateMany({ where: { id: l.id, stage: "NO_ANSWER", assignedToId: l.assignedToId, naRemindedAt: l.naRemindedAt }, data: { naRemindedAt: now } });
      const owner = await ownerOf(l.assignedToId, tx);
      if (!claimed.count || !owner) return null;
      // demo (home «كلّم … (No Answer)»): the salesperson calls, logs the call, and the clock restarts
      await tx.notification.create({ data: { userId: owner.userId, event: "lead.no_answer", text, link, important } });
      sent++;
      return owner.userId;
    });
    if (told) await pushEvent("lead.no_answer", { userIds: [told], text, link });
  }
  return sent;
}
