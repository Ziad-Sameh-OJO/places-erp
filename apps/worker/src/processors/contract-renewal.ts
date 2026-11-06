/**
 * M-11 2.1 step 5 · 2.4 · 7.1: an active contract's salespeople and Finance hear 90, 60 and 30 days before it ends
 * («contract.renewal»), and the first alert opens a renewal lead with the deal's salesperson — a new sale (demo ctRenew).
 * Idempotent: the alert days already sent are claimed on the contract in the same transaction as the notifications.
 * Working days only: a threshold reached on a day off goes out the next working day (renewalAlert marks what passed).
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { eventByKey, fromDecimal, nextYearValue, renewalAlert, toDecimal } from "@places/domain";
import { workingDay } from "../calendar.ts";

const EVENT = "contract.renewal";
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function contractRenewalTick(now = new Date()): Promise<void> {
  const today = await workingDay(now);
  if (!today) return;
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000);
  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE", endsOn: { gte: new Date(today), lte: horizon } },
    select: {
      id: true, code: true, endsOn: true, value: true, escalation: true, renewalAlerts: true, renewalLeadId: true,
      deal: { select: { company: true, type: true, space: true, unit: { select: { code: true } }, participants: { where: { side: "BUYER" }, select: { employee: { select: { id: true, userId: true } } } },
        lead: { select: { name: true, companyId: true, phones: true, area: true } } } },
    },
  });
  if (!contracts.length) return;
  const rule = await prisma.notificationRule.findUnique({ where: { event: EVENT } });
  const finance = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: rule?.toRoles ?? [...eventByKey(EVENT)!.toRoles] } } } } }, select: { id: true } });

  for (const c of contracts) {
    const due = renewalAlert(day(c.endsOn), today, c.renewalAlerts);
    if (!due) continue;
    const told = await prisma.$transaction(async (tx) => {
      // claimed only if nobody else marked it meanwhile
      const claimed = await tx.contract.updateMany({ where: { id: c.id, renewalAlerts: { equals: c.renewalAlerts } }, data: { renewalAlerts: [...new Set([...c.renewalAlerts, ...due.mark])] } });
      if (!claimed.count) return null;
      const sales = c.deal.participants.map((p) => p.employee);
      const lead = c.renewalLeadId || !c.deal.lead || !sales[0] ? null : await openRenewalLead(tx, c, sales[0].id, now);
      const text = `العقد ${c.code} (${c.deal.company} · ${c.deal.unit.code}) بينتهي بعد ${due.days} يوم · ${day(c.endsOn)}${lead ? ` · اتعمل ليد تجديد ${lead.code}` : ""}`;
      const to = [...new Set([...sales.map((s) => s.userId), ...finance.map((u) => u.id)])];
      const link = lead ? `/leads?open=${lead.id}` : `/contracts?open=${c.id}`;
      await tx.notification.createMany({ data: to.map((userId) => ({ userId, event: EVENT, text, link, important: eventByKey(EVENT)!.important })) });
      return { userIds: to, text, link };
    });
    if (told) await pushEvent(EVENT, told);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type DueContract = { id: string; code: string; endsOn: Date; value: { toFixed(n: number): string }; escalation: { toString(): string };
  deal: { company: string; type: string; space: number; lead: { name: string; companyId: string | null; phones: string[]; area: string } | null } };

/** The renewal lead (demo ctRenew): the same client with the deal's salesperson, budget = next year's value (M-11 3.2). */
async function openRenewalLead(tx: Tx, c: DueContract, salesId: string, now: Date) {
  const [seq] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.lead_code_seq') AS n`;
  const budget = nextYearValue(fromDecimal(c.value.toFixed(2)), Number(c.escalation.toString()));
  const lead = await tx.lead.create({
    data: {
      code: `L-${seq!.n}`, name: c.deal.lead!.name, companyId: c.deal.lead!.companyId, phones: c.deal.lead!.phones, area: c.deal.lead!.area,
      type: c.deal.type, space: c.deal.space, budget: toDecimal(budget), channel: "Referral", assignedToId: salesId, assignedAt: now,
      note: `تجديد العقد ${c.code} · ينتهي ${day(c.endsOn)}`, createdById: "system",
    },
    select: { id: true, code: true },
  });
  await tx.leadActivity.create({ data: { leadId: lead.id, kind: "assign", text: `ليد تجديد من العقد ${c.code}`, byUserId: null } });
  await tx.contract.update({ where: { id: c.id }, data: { renewalLeadId: lead.id } });
  await tx.auditLog.create({ data: { module: "leads", entity: "Lead", entityId: lead.id, action: "create", userId: null,
    after: { code: lead.code, assignedToId: salesId, budget: toDecimal(budget), renewalOf: c.code } } });
  return lead;
}
