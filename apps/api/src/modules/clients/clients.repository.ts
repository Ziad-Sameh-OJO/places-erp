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
