/**
 * M-07 9.14: on pay day (finance.payDay, default the 1st) the accountant hears once «اصرف مرتبات الشهر». Nothing is
 * paid here — the accountant pays everyone at once from «المرتبات». Idempotent: `finance.payrollNotifiedFor` holds the
 * month already announced.
 */
import { prisma } from "@places/db";
import { eventByKey, formatEGP, fromDecimal, localDate, monthLabel, monthOf } from "@places/domain";

const NOTIFIED = "finance.payrollNotifiedFor";

export async function payrollDueTick(): Promise<void> {
  const today = localDate(new Date()), month = monthOf(today);
  const day = await prisma.setting.findUnique({ where: { key: "finance.payDay" } });
  if (Number(today.slice(8, 10)) < (typeof day?.value === "number" ? day.value : 1)) return;
  if (await prisma.payrollRun.findUnique({ where: { month } })) return;
  if ((await prisma.setting.findUnique({ where: { key: NOTIFIED } }))?.value === month) return;
  const people = await prisma.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { salary: true } });
  if (!people.length) return;
  const gross = people.reduce((s, p) => s + fromDecimal(p.salary.toFixed(2)), 0);
  const event = eventByKey("finance.payroll_due")!;
  const rule = await prisma.notificationRule.findUnique({ where: { event: event.key } });
  const to = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: rule?.toRoles ?? [...event.toRoles] } } } } }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: NOTIFIED }, create: { key: NOTIFIED, value: month }, update: { value: month } });
    await tx.notification.createMany({ data: to.map((u) => ({ userId: u.id, text: `اصرف مرتبات ${monthLabel(month)} · ${people.length} موظف · إجمالي ${formatEGP(gross)}`, link: "/finance", important: event.important })) });
  });
}
