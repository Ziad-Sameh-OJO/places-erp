/**
 * 1.27 · 4 Nov meeting: every day, the people who decide on the Draft Admin (draftAdmin.see, Operations by default)
 * get an Alarm with how many Not Interested / Cancellation leads still wait for them and how many came today (demo
 * home: «Alarm: n Not Interested / Cancellation مستنيين قرارك · m النهارده»). Once a Cairo day: the day is claimed in
 * the Setting «draftAdminAlarm» in the same transaction as the notifications. Working days only (the configured days off
 * and official holidays rest): the next working day's Alarm counts everything still waiting.
 */
import { prisma } from "@places/db";
import { type LeadRules, draftAdminAlarm } from "@places/domain";
import { leadRules, tellRule } from "../leads.ts";
import { workingDay } from "../calendar.ts";

const KEY = "draftAdminAlarm";

/** `pinned`: the saved «قواعد الليدز» unless given (the e2e pins them). Returns how many were told. */
export async function draftAdminAlarmTick(now = new Date(), pinned?: LeadRules): Promise<number> {
  const rules = pinned ?? (await leadRules());
  if (!rules.draftAdmin.on) return 0;
  const today = await workingDay(now, rules);
  if (!today) return 0;
  const waiting = await prisma.leadDraft.findMany({ where: { kind: "admin", decidedAt: null, keptAt: null, lead: { archivedAt: null } }, select: { at: true } });
  const alarm = draftAdminAlarm(waiting, now);
  if (!alarm) return 0;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES (${KEY}, '""'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = ${KEY} FOR UPDATE`;
    if (row?.value === today) return 0; // already sent today
    await tx.setting.update({ where: { key: KEY }, data: { value: today } });
    const text = `Alarm: ${alarm.waiting} Not Interested / Cancellation مستنيين قرارك${alarm.today ? ` · ${alarm.today} النهارده` : ""}`;
    // to the ones who see it and decide, in the app, whatever channels the «see» list has (it names viewers, not channels)
    return (await tellRule(tx, { to: rules.draftAdmin.see.to, ch: ["app"] }, null, { text, link: "/leads", important: true, event: "lead.draft_admin_alarm" })).userIds.length;
  });
}
