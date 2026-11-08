import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";
import { DEAL_ROW, search } from "./deals.repository";

const SHEET_ROW = {
  ...DEAL_ROW, source: true,
  participants: {
    select: { side: true, approved: true, employeeId: true, employee: { select: { id: true, name: true, commissionPct: true, teamLeader: { select: { name: true } } } } },
    orderBy: { employee: { name: "asc" } },
  },
  payments: { select: { side: true, amount: true, receivedAt: true }, orderBy: { receivedAt: "asc" } },
} satisfies Prisma.DealSelect;
export type DealSheetRecord = Prisma.DealGetPayload<{ select: typeof SHEET_ROW }>;

/** Prisma only, read only (M-02 5.9–5.11): the deals with their participants' schemes and their collections. */
@Injectable()
export class DealSheetRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  // shortcut: the newest 2,000 deals in scope, the sheet is filtered in the browser; page it when the sheet grows past that
  sheet(scope: Prisma.DealWhereInput, f: { q?: string | undefined; statuses?: string[] | undefined; byLocation?: boolean } = {}) {
    const where: Prisma.DealWhereInput = { AND: [scope, f.statuses ? { status: { in: f.statuses as never } } : {}, search(f.q, f.byLocation ?? true)] };
    return this.db.deal.findMany({ where, select: SHEET_ROW, orderBy: [{ closedAt: "desc" }, { id: "desc" }], take: 2_000 });
  }
}
