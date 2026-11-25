/**
 * M-07 9.16: on a fixed bill's day the accountant hears about it once («ميعاد فاتورة …»). Nothing is paid here — the
 * accountant approves and pays (a voucher) or skips the month. The rule is billState() from @places/domain; this file
 * only applies it. Idempotent: `notifiedFor` holds the month already announced. Working days only: a bill whose day
 * falls on a day off is announced the next working day (billState is «due» from its day on), even when that is next
 * month (review L14: noticeMonths keeps last month's notice until it went out; never a month before the bill existed).
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { eventByKey, formatEGP, fromDecimal, localDate, monthLabel, monthOf, noticeMonths } from "@places/domain";
import { workingDay } from "../calendar.ts";

export async function recurringBillsTick(now = new Date()): Promise<void> {
  const today = await workingDay(now);
  if (!today) return;
  const thisMonth = monthOf(today);
  const bills = await prisma.recurringBill.findMany({ where: { active: true, OR: [{ notifiedFor: null }, { notifiedFor: { lt: thisMonth } }] }, include: { months: true } });
  // each month not told yet, from its day on, unless it was already paid or skipped
  const due = bills.flatMap((b) => noticeMonths(today, b.day, b.notifiedFor, monthOf(localDate(b.createdAt))).filter((m) => !b.months.some((x) => x.month === m)).map((month) => ({ b, month })));
  if (!due.length) return;
  const event = eventByKey("finance.bill_due")!;
  const rule = await prisma.notificationRule.findUnique({ where: { event: event.key } });
  const roles = rule?.toRoles ?? [...event.toRoles];
  const people = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: roles } } } } }, select: { id: true } });
  for (const { b, month } of due) {
    const text = `ميعاد فاتورة ${b.name}${month === thisMonth ? "" : ` (${monthLabel(month)})`} · ${formatEGP(fromDecimal(b.amount.toFixed(2)))} · ${b.vendor} · مستنية موافقتك`;
    const told = await prisma.$transaction(async (tx) => {
      // optimistic: another run already announced it this month
      const claimed = await tx.recurringBill.updateMany({ where: { id: b.id, OR: [{ notifiedFor: null }, { notifiedFor: { lt: month } }] }, data: { notifiedFor: month } });
      if (!claimed.count) return false;
      await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, event: event.key, text, link: "/finance", important: event.important })) });
      return true;
    });
    if (told) await pushEvent(event.key, { userIds: people.map((p) => p.id), text, link: "/finance" });
  }
}
