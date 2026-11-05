import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { ClientFilters } from "@places/contracts";
import { normalizePhone } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient;

export const CLIENT_ROW = {
  id: true, name: true, company: true, kind: true, status: true, lastContactAt: true,
  phones: { select: { phone: true }, orderBy: { createdAt: "asc" } },
  _count: { select: { units: { where: { archivedAt: null } } } },
} satisfies Prisma.ClientSelect;
export type ClientRowRecord = Prisma.ClientGetPayload<{ select: typeof CLIENT_ROW }>;

const DEAL_OF_FILE = {
  id: true, code: true, type: true, status: true, closedAt: true, commissionOwner: true, commissionClient: true,
  lead: { select: { clientId: true } }, unit: { select: { code: true, ownerId: true } }, payments: { select: { side: true, amount: true } },
} satisfies Prisma.DealSelect;
export type FileDealRecord = Prisma.DealGetPayload<{ select: typeof DEAL_OF_FILE }>;

/** Data access only. Who sees which file (M-10 4.1) is part of every query (`visible`), never filtered afterwards. */
@Injectable()
export class ClientsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(visible: Prisma.ClientWhereInput, f: ClientFilters) {
    const where = { AND: [visible, filterWhere(f)] };
    return this.db.$transaction([
      this.db.client.findMany({ where, select: CLIENT_ROW, orderBy: [{ lastContactAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.client.count({ where }),
    ]);
  }

  summary(visible: Prisma.ClientWhereInput, staleBefore: Date) {
    const count = (w: Prisma.ClientWhereInput) => this.db.client.count({ where: { AND: [visible, w] } });
    return this.db.$transaction([
      count({ kind: { in: ["client", "both"] } }),
      count({ kind: { in: ["owner", "both"] } }),
      count({ kind: { in: ["owner", "both"] }, units: { some: { archivedAt: null, lastOwnerUpdateAt: { lt: staleBefore } } } }),
      count({ kind: "both" }),
    ]);
  }

  /** The deals of these files: as the client (through their leads) or as the owner (on their units). */
  dealsOf(ids: string[]) {
    return this.db.deal.findMany({
      where: { OR: [{ lead: { clientId: { in: ids } } }, { unit: { ownerId: { in: ids } } }] },
      select: DEAL_OF_FILE, orderBy: { closedAt: "desc" },
    });
  }

  file(visible: Prisma.ClientWhereInput, id: string) {
    return this.db.client.findFirst({
      where: { AND: [visible, { id }] },
      select: {
        ...CLIENT_ROW, preferredContact: true,
        units: { where: { archivedAt: null }, select: { id: true, code: true, project: true, type: true, space: true, status: true, lastOwnerUpdateAt: true }, orderBy: { code: "asc" } },
        leads: { where: { archivedAt: null }, select: { id: true, code: true, stage: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        interactions: { select: { id: true, kind: true, text: true, byId: true, at: true }, orderBy: { at: "desc" }, take: 200 },
      },
    });
  }

  contracts(dealIds: string[]) {
    return dealIds.length
      ? this.db.contract.findMany({ where: { dealId: { in: dealIds } }, select: { id: true, code: true, dealId: true, startsOn: true, endsOn: true, status: true }, orderBy: { endsOn: "desc" } })
      : Promise.resolve([]);
  }

  userNames(ids: string[]) {
    return ids.length ? this.db.employee.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true } }) : Promise.resolve([]);
  }

  /** The file a number belongs to (numbers are stored normalized). */
  byPhones(tx: Tx, phones: string[]) {
    return tx.clientPhone.findMany({ where: { phone: { in: phones } }, select: { phone: true, client: { select: { id: true, kind: true } } } });
  }

  // ── merges (M-10 2.2) ──

  pendingMerges() {
    return this.db.clientMerge.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  }

  mergeSides(ids: string[]) {
    return this.db.client.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, name: true, kind: true, phones: { select: { phone: true } } } });
  }

  /** A merge of these two files (either way round) already waiting. */
  openMerge(tx: Tx, a: string, b: string) {
    return tx.clientMerge.findFirst({ where: { status: "pending", OR: [{ keepId: a, dropId: b }, { keepId: b, dropId: a }] }, select: { id: true } });
  }

  /** A live file as the merge and its audit need it. */
  snapshot(tx: Tx, id: string) {
    return tx.client.findFirst({
      where: { id, archivedAt: null },
      select: { id: true, name: true, kind: true, status: true, company: true, preferredContact: true, lastContactAt: true, phones: { select: { phone: true } } },
    });
  }

  /** Everything of the dropped file moves to the kept one: numbers, leads, units, contact log. */
  async moveInto(tx: Tx, dropId: string, keepId: string) {
    await tx.clientPhone.updateMany({ where: { clientId: dropId }, data: { clientId: keepId } });
    await tx.lead.updateMany({ where: { clientId: dropId }, data: { clientId: keepId } });
    await tx.unit.updateMany({ where: { ownerId: dropId }, data: { ownerId: keepId } });
    await tx.clientInteraction.updateMany({ where: { clientId: dropId }, data: { clientId: keepId } });
  }

  /** The system's suggestion when one person's numbers are on two files (M-10 2.2), once per pair. */
  async suggestMerge(tx: Tx, keepId: string, dropId: string, reason: string) {
    if (await this.openMerge(tx, keepId, dropId)) return null;
    return tx.clientMerge.create({ data: { keepId, dropId, reason } });
  }

  /** The owner's units get this «last update»; returns them as they were (for the audit). */
  async touchOwnerUnits(tx: Tx, ownerId: string, at: Date) {
    const units = await tx.unit.findMany({ where: { ownerId, archivedAt: null }, select: { id: true, lastOwnerUpdateAt: true } });
    await tx.unit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: { lastOwnerUpdateAt: at } });
    return units;
  }

  addInteraction(tx: Tx, data: { clientId: string; kind: string; text: string; byId: string }) {
    return tx.clientInteraction.create({ data });
  }
}

/** The list's search (M-10 5.2: name, number, company, unit code) and its tabs. */
function filterWhere(f: ClientFilters): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [{ archivedAt: null }];
  if (f.kind) and.push({ kind: { in: [f.kind, "both"] } });
  if (f.q) {
    const digits = normalizePhone(f.q) ?? f.q.replace(/\D/g, ""); // a number written any way (+20, spaces…)
    and.push({ OR: [
      { name: { contains: f.q, mode: "insensitive" } },
      { company: { contains: f.q, mode: "insensitive" } },
      { units: { some: { code: { contains: f.q, mode: "insensitive" } } } },
      ...(digits.length >= 3 ? [{ phones: { some: { phone: { contains: digits } } } }] : []),
    ] });
  }
  return { AND: and };
}
