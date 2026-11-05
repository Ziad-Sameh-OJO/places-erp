/**
 * M-11 2.1 step 3 · 2.4 · 7.1 (+ M-02 2.4): an active contract's unpaid installment → 3 days before its day the
 * salesperson and Finance are reminded; the day after, it's late (the salesperson, Finance and the sales manager);
 * 7 days late it's escalated to management. Once a day, on a working day (Friday and official holidays skipped, like
 * the other daily jobs); what came due meanwhile goes out the next working day. Idempotent: the alerts sent are
 * claimed on the installment in the same transaction as the notifications.
 */
import { prisma } from "@places/db";
import { PLACES_CALENDAR, eventByKey, formatEGP, fromDecimal, holidayDays, installmentAlerts, isWorkingDay, localDate, type InstallmentAlert } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);
const EVENT: Record<InstallmentAlert, string> = { reminder: "contract.installment_due", late: "contract.installment_late", escalated: "contract.installment_escalated" };

export async function installmentAlertsTick(now = new Date()): Promise<number> {
  const today = localDate(now);
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  if (!isWorkingDay(today, { ...PLACES_CALENDAR, holidays })) return 0;
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000);
  const rows = await prisma.installment.findMany({
    where: { dueOn: { lte: horizon }, contract: { status: "ACTIVE" }, NOT: { alerts: { hasEvery: ["late", "escalated"] } } },
    select: {
      id: true, dueOn: true, amount: true, paid: true, alerts: true,
      contract: { select: { id: true, code: true, deal: { select: { company: true, participants: { where: { side: "BUYER" }, select: { employee: { select: { userId: true } } } } } } } },
    },
  });
  const unpaid = rows.filter((i) => i.paid.lessThan(i.amount));
  if (!unpaid.length) return 0;
  const byRole = new Map<InstallmentAlert, string[]>();
  for (const alert of ["reminder", "late", "escalated"] as const) {
    const ev = eventByKey(EVENT[alert])!;
    const rule = await prisma.notificationRule.findUnique({ where: { event: ev.key } });
    byRole.set(alert, (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: rule?.toRoles ?? [...ev.toRoles] } } } } }, select: { id: true } })).map((u) => u.id));
  }

  let sent = 0;
  for (const i of unpaid) {
    const due = installmentAlerts(day(i.dueOn), today, i.alerts);
    if (!due.length) continue;
    await prisma.$transaction(async (tx) => {
      // claimed only if nobody else marked it meanwhile
      const claimed = await tx.installment.updateMany({ where: { id: i.id, alerts: { equals: i.alerts } }, data: { alerts: [...i.alerts, ...due] } });
      if (!claimed.count) return;
      const c = i.contract, owed = formatEGP(fromDecimal(i.amount.toFixed(2)) - fromDecimal(i.paid.toFixed(2)));
      const sales = c.deal.participants.map((p) => p.employee.userId);
      const what = `قسط العقد ${c.code} (${c.deal.company}) · ${owed} · ميعاده ${day(i.dueOn)}`;
      for (const alert of due) {
        const text = alert === "reminder" ? `${what} · فاضل ${Math.round((i.dueOn.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)} يوم`
          : alert === "late" ? `${what} · اتأخر ومتحصّلش` : `تصعيد: ${what} · متأخر 7 أيام أو أكتر`;
        const to = [...new Set([...(alert === "escalated" ? [] : sales), ...byRole.get(alert)!])];
        await tx.notification.createMany({ data: to.map((userId) => ({ userId, text, link: `/contracts?open=${c.id}`, important: eventByKey(EVENT[alert])!.important })) });
        sent += to.length;
      }
    });
  }
  return sent;
}
