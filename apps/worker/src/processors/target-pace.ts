/**
 * M-12 · 11.8: once a working day, every Team Leader hears which of his salespeople are under the month's pace (demo
 * «تحت المعدل»: below 60% of the share of the month gone by). Idempotent: `targets.paceNotifiedFor` holds the day done.
 */
import { prisma } from "@places/db";
import { behindPace, isWorkingDay, localDate, monthBounds, targetPercent } from "@places/domain";
import { salesFigures } from "./scheduled-reports.ts";
import { workCalendar } from "../calendar.ts";
import { pushEvent } from "../push.ts";

const DONE = "targets.paceNotifiedFor";

export async function targetPaceTick(now = new Date()): Promise<void> {
  const cal = await workCalendar(), today = localDate(now, cal);
  if (!isWorkingDay(today, cal) || (await prisma.setting.findUnique({ where: { key: DONE } }))?.value === today) return;
  const b = monthBounds(today.slice(0, 7), cal);
  const behind = (await salesFigures(today.slice(0, 7), b.from, b.to)).map((f) => ({ ...f, percent: targetPercent(f.achieved, f.goal) }))
    .filter((f) => f.goal > 0 && f.teamLeader && behindPace(f.percent, Number(today.slice(8, 10)), b.days));
  const byTl = new Map<string, string[]>();
  for (const f of behind) byTl.set(f.teamLeader!.userId, [...(byTl.get(f.teamLeader!.userId) ?? []), `${f.name} ${Math.round(f.percent)}%`]);
  const told = await prisma.$transaction(async (tx) => {
    // claimed under a row lock: a second worker (or a retry) sees the day already taken
    await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES (${DONE}, '""'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = ${DONE} FOR UPDATE`;
    if (row?.value === today) return false;
    await tx.setting.update({ where: { key: DONE }, data: { value: today } });
    if (byTl.size) await tx.notification.createMany({ data: [...byTl].map(([userId, names]) => ({ userId, event: "target.behind", text: `تحت معدل التارجت: ${names.join("، ")}`, link: "/reports" })) });
    return true;
  });
  if (told) for (const [userId, names] of byTl) await pushEvent("target.behind", { userIds: [userId], text: `تحت معدل التارجت: ${names.join("، ")}`, link: "/reports" });
}
