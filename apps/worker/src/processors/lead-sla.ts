/**
 * M-01 SLA: warn the Team Leader at 2h30 of working time, pull the lead to the next salesperson at 3h
 * (on official holidays: 22h / 24h wall-clock). The rule is leadSla() from @places/domain — this file only applies it.
 */
import { prisma } from "@places/db";
import { LeadRouter, PLACES_CALENDAR, leadSla, localDate } from "@places/domain";

export async function leadSlaTick(): Promise<void> {
  const now = new Date();
  const holidays = new Set((await prisma.holiday.findMany()).map((h) => h.day.toISOString().slice(0, 10)));
  const calendar = { ...PLACES_CALENDAR, holidays };
  const holidayMode = holidays.has(localDate(now, calendar));

  const fresh = await prisma.lead.findMany({ where: { stage: "FRESH", touched: false, ownedByTelesales: false, assignedAt: { not: null }, archivedAt: null } });
  for (const lead of fresh) {
    const sla = leadSla({ stage: "Fresh", touched: false, ownedByTelesales: false, assignedAt: lead.assignedAt! }, now, { holidayMode, calendar });
    if (!sla || sla.level === "ok") continue;
    if (sla.level === "warn") {
      // TODO(phase 1): notify the salesperson's Team Leader once (NotificationRule "sla-warning"), mark the lead as warned
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const routing = await tx.setting.findUnique({ where: { key: "routing" } });
      const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
      const router = new LeadRouter((routing?.value as never) ?? { cursor: {}, skipTurns: {} });
      const pool = (pools[lead.area] ?? []).filter((id) => id !== lead.assignedToId);
      const next = router.next(lead.area, pool);
      if (!next) return;
      await tx.lead.update({ where: { id: lead.id, assignedToId: lead.assignedToId }, // optimistic: skip if someone changed it meanwhile
        data: { assignedToId: next, assignedAt: now, activities: { create: { kind: "system", text: `اتسحب أوتوماتيك بعد ${holidayMode ? "24 ساعة" : "3 ساعات"} من غير أكشن` } } } });
      await tx.setting.update({ where: { key: "routing" }, data: { value: router.snapshot() as never } });
      await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: lead.id, action: "auto-pull", before: { assignedToId: lead.assignedToId }, after: { assignedToId: next } } });
    });
  }
}
