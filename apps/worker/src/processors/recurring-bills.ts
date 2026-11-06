/**
 * M-07 9.16: on a fixed bill's day the accountant hears about it once («ميعاد فاتورة …»). Nothing is paid here — the
 * accountant approves and pays (a voucher) or skips the month. The rule is billState() from @places/domain; this file
 * only applies it. Idempotent: `notifiedFor` holds the month already announced. Working days only: a bill whose day
 * falls on a day off is announced the next working day (billState is «due» from its day on).
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { billState, eventByKey, formatEGP, fromDecimal, monthOf } from "@places/domain";
import { workingDay } from "../calendar.ts";

export async function recurringBillsTick(now = new Date()): Promise<void> {
  const today = await workingDay(now);
  if (!today) return;
  const month = monthOf(today);
  const bills = await prisma.recurringBill.findMany({ where: { active: true, OR: [{ notifiedFor: null }, { notifiedFor: { not: month } }] }, include: { months: { where: { month } } } });
  const due = bills.filter((b) => billState(b, (b.months[0]?.status as "paid" | "skipped" | undefined) ?? null, today) === "due");
  if (!due.length) return;
  const event = eventByKey("finance.bill_due")!;
  const rule = await prisma.notificationRule.findUnique({ where: { event: event.key } });
  const roles = rule?.toRoles ?? [...event.toRoles];
  const people = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: roles } } } } }, select: { id: true } });
  for (const b of due) {
    const text = `ميعاد فاتورة ${b.name} · ${formatEGP(fromDecimal(b.amount.toFixed(2)))} · ${b.vendor} · مستنية موافقتك`;
    const told = await prisma.$transaction(async (tx) => {
      // optimistic: another run already announced it this month
      const claimed = await tx.recurringBill.updateMany({ where: { id: b.id, OR: [{ notifiedFor: null }, { notifiedFor: { not: month } }] }, data: { notifiedFor: month } });
      if (!claimed.count) return false;
      await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, event: event.key, text, link: "/finance", important: event.important })) });
      return true;
    });
    if (told) await pushEvent(event.key, { userIds: people.map((p) => p.id), text, link: "/finance" });
  }
}
