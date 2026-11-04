/**
 * M-01 SLA: warn, then pull the lead to the next salesperson, with the times, working hours and on / off switch of
 * «قواعد الليدز» (1.29) and the official holidays as ranges. The rule is leadSla() from @places/domain — this file
 * only applies it (the warnings and who is told come with 1.16).
 */
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES, LeadRouter, PLACES_CALENDAR, type LeadRules, calendarOf, durationText, holidayDays, leadSla, localDate, slaRulesOf } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function leadSlaTick(): Promise<void> {
  const now = new Date();
  const saved = ((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value ?? {}) as Partial<LeadRules>;
  const rules: LeadRules = { ...DEFAULT_LEAD_RULES, ...saved, work: { ...DEFAULT_LEAD_RULES.work, ...saved.work }, sla: { ...DEFAULT_LEAD_RULES.sla, ...saved.sla } };
  if (!rules.sla.on) return;
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  const calendar = { ...calendarOf(rules, PLACES_CALENDAR), holidays };
  const holidayMode = holidays.has(localDate(now, calendar));

  const fresh = await prisma.lead.findMany({ where: { stage: "FRESH", touched: false, ownedByTelesales: false, assignedAt: { not: null }, archivedAt: null } });
  for (const lead of fresh) {
    const sla = leadSla({ stage: "Fresh", touched: false, ownedByTelesales: false, assignedAt: lead.assignedAt! }, now, { holidayMode, calendar, rules: slaRulesOf(rules) });
    if (!sla || sla.level === "ok") continue;
    if (sla.level === "warn") {
      // TODO(phase 1): notify the salesperson's Team Leader once (NotificationRule "sla-warning"), mark the lead as warned
      continue;
    }
    await prisma.$transaction(async (tx) => {
      // locked like the API does when it creates a lead: a pull and a new lead at the same moment both keep their turn
      await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES ('routing', '{"cursor":{},"skipTurns":{}}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
      const [routing] = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = 'routing' FOR UPDATE`;
      const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
      const router = new LeadRouter((routing?.value as never) ?? { cursor: {}, skipTurns: {} });
      const pool = (pools[lead.area] ?? []).filter((id) => id !== lead.assignedToId);
      const next = router.next(lead.area, pool);
      if (!next) return;
      await tx.lead.update({ where: { id: lead.id, assignedToId: lead.assignedToId }, // optimistic: skip if someone changed it meanwhile
        data: { assignedToId: next, assignedAt: now, activities: { create: { kind: "system", text: `اتسحب أوتوماتيك بعد ${durationText(holidayMode ? rules.sla.holPullMin : rules.sla.pullMin)} من غير أكشن` } } } });
      await tx.setting.update({ where: { key: "routing" }, data: { value: router.snapshot() as never } });
      await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: lead.id, action: "auto-pull", before: { assignedToId: lead.assignedToId }, after: { assignedToId: next } } });
    });
  }
}
