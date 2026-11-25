/**
 * M-07 9.14: on pay day (finance.payDay, default the 1st) the accountant hears once «اصرف مرتبات الشهر» — the month
 * payrollMonth() names (pay day 1 → on 1 Nov, October's). Nothing is
 * paid here — the accountant pays everyone at once from «المرتبات». Idempotent: `finance.payrollNotifiedFor` holds the
 * month already announced. Working days only: a pay day on a day off is announced the next working day; the due date
 * (payrollDueDate) may fall in the next month, so a month-end of days off doesn't lose the notice (review L14).
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { eventByKey, formatEGP, fromDecimal, monthLabel, payrollDueDate, payrollMonth } from "@places/domain";
import { workingDay } from "../calendar.ts";

const NOTIFIED = "finance.payrollNotifiedFor";

export async function payrollDueTick(now = new Date()): Promise<void> {
  const today = await workingDay(now);
  if (!today) return;
  const month = payrollMonth(today); // the month the run pays now (up to the 15th: the previous one)
  const day = await prisma.setting.findUnique({ where: { key: "finance.payDay" } });
  if (today < payrollDueDate(month, typeof day?.value === "number" ? day.value : 1)) return;
  if (await prisma.payrollRun.findUnique({ where: { month } })) return;
  const people = await prisma.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { salary: true } });
  if (!people.length) return;
  const gross = people.reduce((s, p) => s + fromDecimal(p.salary.toFixed(2)), 0);
  const event = eventByKey("finance.payroll_due")!;
  const rule = await prisma.notificationRule.findUnique({ where: { event: event.key } });
  const to = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: rule?.toRoles ?? [...event.toRoles] } } } } }, select: { id: true } });
  const text = `اصرف مرتبات ${monthLabel(month)} · ${people.length} موظف · إجمالي ${formatEGP(gross)}`;
  const told = await prisma.$transaction(async (tx) => {
    // claimed under a row lock: a second worker (or a retry) sees the month already taken
    await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES (${NOTIFIED}, '""'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = ${NOTIFIED} FOR UPDATE`;
    if (typeof row?.value === "string" && row.value >= month) return false;
    await tx.setting.update({ where: { key: NOTIFIED }, data: { value: month } });
    await tx.notification.createMany({ data: to.map((u) => ({ userId: u.id, event: event.key, text, link: "/finance", important: event.important })) });
    return true;
  });
  if (told) await pushEvent(event.key, { userIds: to.map((u) => u.id), text, link: "/finance" });
}
