/**
 * M-12 · 11.8: once a working day, every Team Leader hears which of his salespeople are under the month's pace (demo
 * «تحت المعدل»: below 60% of the share of the month gone by). Idempotent: `targets.paceNotifiedFor` holds the day done.
 */
import { prisma, salesFigures } from "@places/db";
import { behindPace, isWorkingDay, localDate, monthBounds, targetPercent } from "@places/domain";
import { workCalendar } from "../calendar.ts";
import { pushEvent } from "../push.ts";

const DONE = "targets.paceNotifiedFor";

export async function targetPaceTick(now = new Date()): Promise<void> {
  const cal = await workCalendar(), today = localDate(now, cal);
  if (!isWorkingDay(today, cal) || (await prisma.setting.findUnique({ where: { key: DONE } }))?.value === today) return;
  const b = monthBounds(today.slice(0, 7), cal);
  const behind = (await salesFigures(prisma, today.slice(0, 7), b.from, b.to)).map((f) => ({ ...f, percent: targetPercent(f.achieved, f.goal) }))
    .filter((f) => f.goal > 0 && f.teamLeader && behindPace(f.percent, Number(today.slice(8, 10)), b.days));
  const byTl = new Map<string, string[]>();
  for (const f of behind) byTl.set(f.teamLeader!.userId, [...(byTl.get(f.teamLeader!.userId) ?? []), `${f.name} ${Math.round(f.percent)}%`]);
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: DONE }, create: { key: DONE, value: today }, update: { value: today } });
    if (byTl.size) await tx.notification.createMany({ data: [...byTl].map(([userId, names]) => ({ userId, event: "target.behind", text: `تحت معدل التارجت: ${names.join("، ")}`, link: "/reports" })) });
  });
  for (const [userId, names] of byTl) await pushEvent("target.behind", { userIds: [userId], text: `تحت معدل التارجت: ${names.join("، ")}`, link: "/reports" });
}
