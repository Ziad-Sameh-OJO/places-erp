import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { OPEN_TICKET_STATUSES } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

const ROW = {
  id: true, number: true, type: true, department: true, title: true, priority: true, status: true, fromUserId: true,
  firstReplyAt: true, resolvedAt: true, createdAt: true, _count: { select: { events: true } },
} satisfies Prisma.TicketSelect;
export type TicketRecord = Prisma.TicketGetPayload<{ select: typeof ROW }>;

/** Data access only. `scope` (who may see which tickets) is always ANDed in the query. */
@Injectable()
export class TicketsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  page(where: Prisma.TicketWhereInput, orderBy: Prisma.TicketOrderByWithRelationInput[], skip: number, take: number) {
    return this.db.$transaction([
      this.db.ticket.findMany({ where, select: ROW, orderBy, skip, take }),
      this.db.ticket.count({ where }),
    ]);
  }

  /** Every open ticket in the scope: lateness depends on the working calendar, so it's worked out on these. */
  open(scope: Prisma.TicketWhereInput) {
    return this.db.ticket.findMany({ where: { AND: [scope, { status: { in: [...OPEN_TICKET_STATUSES] } }] }, select: ROW, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  count(where: Prisma.TicketWhereInput) {
    return this.db.ticket.count({ where });
  }

  /** Tickets opened in [from, to) — the response report and the summary's average. */
  openedBetween(from: Date, to: Date, where: Prisma.TicketWhereInput = {}) {
    return this.db.ticket.findMany({ where: { AND: [where, { createdAt: { gte: from, lt: to } }] }, select: ROW });
  }

  detail(scope: Prisma.TicketWhereInput, id: string) {
    return this.db.ticket.findFirst({ where: { AND: [scope, { id }] }, select: { ...ROW, events: { orderBy: { at: "asc" } } } });
  }

  names(userIds: string[]) {
    return this.db.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, email: true, employee: { select: { name: true } } } });
  }

  /** The people of a department who get its new tickets (M-06 2.1: «يبعت إشعار للقسم المسؤول»). */
  async departmentPeople(department: string): Promise<string[]> {
    const rows = await this.db.user.findMany({ where: { status: "ACTIVE", employee: { department } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  create(tx: Prisma.TransactionClient, data: Prisma.TicketUncheckedCreateInput) {
    return tx.ticket.create({ data, select: { id: true, number: true } });
  }

  /** Only while the ticket is still in `status`: two people acting at once can't both move it. */
  update(tx: Prisma.TransactionClient, id: string, status: string, data: Prisma.TicketUncheckedUpdateInput) {
    return tx.ticket.updateMany({ where: { id, status }, data });
  }

  addEvent(tx: Prisma.TransactionClient, ticketId: string, kind: string, text: string, byUserId: string | null) {
    return tx.ticketEvent.create({ data: { ticketId, kind, text, byUserId } });
  }
}
