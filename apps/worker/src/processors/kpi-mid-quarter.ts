/**
 * M-12 2.1 · 11.6: «لو بند تحت المستهدف في نص الربع ← تنبيه للموظف والمتابع». From the 15th of the quarter's middle month
 * (quarterMidpoint), on the first working day (Friday and official holidays skipped), each card of the open quarter is
 * checked once (midAlertAt): items under target → the owner and the follower (no follower = the Super Admins) hear it.
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { PLACES_CALENDAR, holidayDays, isWorkingDay, itemAchievement, localDate, quarterLabel, quarterMidpoint, type Method } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function kpiMidQuarterTick(now = new Date()): Promise<number> {
  const today = localDate(now);
  const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  if (!q || q.status !== "open" || today < quarterMidpoint(q.id)) return 0;
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  if (!isWorkingDay(today, { ...PLACES_CALENDAR, holidays })) return 0;

  const cards = await prisma.kpiCard.findMany({
    where: { quarter: q.id, midAlertAt: null },
    include: { employee: { select: { name: true, userId: true } }, follower: { select: { userId: true } }, items: { include: { _count: { select: { deliveries: true } } } } },
  });
  const owners = cards.some((c) => !c.follower)
    ? (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: "admin" } } } }, select: { id: true } })).map((u) => u.id)
    : [];
  let alerted = 0;
  for (const c of cards) {
    const below = c.items.filter((it) => itemAchievement({ method: it.method as Method, direction: it.direction as "at-least" | "at-most", goal: Number(it.goal),
      value: it.value == null ? null : Number(it.value), required: it.required, delivered: it._count.deliveries }) < 1);
    const to = [...new Set([c.employee.userId, ...(c.follower ? [c.follower.userId] : owners)])];
    const text = await prisma.$transaction(async (tx) => {
      const claimed = await tx.kpiCard.updateMany({ where: { id: c.id, midAlertAt: null }, data: { midAlertAt: now } });
      if (!claimed.count || !below.length) return null;
      const text = `نص ${quarterLabel(q.id)}: ${below.length} بند تحت المستهدف في كارت ${c.employee.name} (${below.map((it) => it.title).slice(0, 3).join(" · ")}${below.length > 3 ? " …" : ""})`;
      await tx.notification.createMany({ data: to.map((userId) => ({ userId, event: "kpi.mid_quarter", text, link: "/kpis", important: true })) });
      alerted++;
      return text;
    });
    if (text) await pushEvent("kpi.mid_quarter", { userIds: to, text, link: "/kpis" });
  }
  return alerted;
}
