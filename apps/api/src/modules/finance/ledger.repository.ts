import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

export type Tx = Prisma.TransactionClient;
export interface AccountRow { id: string; code: string; name: string; parentId: string | null; nature: string; kind: string | null; fixed: boolean }
export interface LineInput { accountId: string; debit: string; credit: string }

const ACCOUNT = { id: true, code: true, name: true, parentId: true, nature: true, kind: true, fixed: true } as const;

/** Prisma only: the chart, the journal and the sums behind the live balances. No decisions here. */
@Injectable()
export class LedgerRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  accounts(tx: Tx | PrismaClient = this.db): Promise<AccountRow[]> {
    return tx.account.findMany({ where: { archivedAt: null }, select: ACCOUNT, orderBy: { code: "asc" } });
  }

  account(id: string, tx: Tx | PrismaClient = this.db) {
    return tx.account.findFirst({ where: { id, archivedAt: null }, select: { ...ACCOUNT, _count: { select: { lines: true, children: true } } } });
  }

  accountByCode(code: string, tx: Tx | PrismaClient = this.db) {
    return tx.account.findUnique({ where: { code }, select: ACCOUNT });
  }

  childByName(parentId: string, name: string, tx: Tx) {
    return tx.account.findFirst({ where: { parentId, name }, select: ACCOUNT });
  }

  childCodes(parentId: string, tx: Tx | PrismaClient = this.db) {
    return tx.account.findMany({ where: { parentId }, select: { code: true } }).then((r) => r.map((x) => x.code));
  }

  /** Debit and credit per account from a day on (the income statement's month / year). */
  sumsSince(from: Date, tx: Tx | PrismaClient = this.db) {
    return tx.journalLine.groupBy({ by: ["accountId"], where: { entry: { date: { gte: from } } }, _sum: { debit: true, credit: true } });
  }

  /** Total debit and credit per account (each account's own lines). */
  sums(tx: Tx | PrismaClient = this.db) {
    return tx.journalLine.groupBy({ by: ["accountId"], _sum: { debit: true, credit: true } });
  }

  createAccount(data: { code: string; name: string; parentId: string; nature: string; kind: string | null; holderId?: string; partyType?: string; partyId?: string }, tx: Tx) {
    return tx.account.create({ data, select: ACCOUNT });
  }

  /** 9.12: a client's / salesperson's own account, if it was opened already. */
  partyAccount(partyType: string, partyId: string, tx: Tx | PrismaClient = this.db) {
    return tx.account.findUnique({ where: { partyType_partyId: { partyType, partyId } }, select: ACCOUNT });
  }

  /** A person's own sub-account under a parent (131 سلف · 134 عهد), if it was opened already. */
  holderAccount(parentId: string, holderId: string, tx: Tx | PrismaClient = this.db) {
    return tx.account.findFirst({ where: { parentId, holderId, archivedAt: null }, select: ACCOUNT });
  }

  caps(tx: Tx | PrismaClient = this.db) {
    return tx.account.findMany({ where: { cap: { not: null }, archivedAt: null }, select: { id: true, cap: true } });
  }

  setCap(id: string, cap: string, tx: Tx) {
    return tx.account.update({ where: { id }, data: { cap }, select: { id: true } });
  }

  setEntrySource(entryId: string, sourceId: string, tx: Tx) {
    return tx.journalEntry.update({ where: { id: entryId }, data: { sourceId } });
  }

  lockChildren(parentCode: string, tx: Tx) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-children:${parentCode}`}))`;
  }

  /** Until the transaction ends: one money-out at a time per account, in a fixed order so two of them can't deadlock. */
  async lockBalances(ids: string[], tx: Tx) {
    for (const id of [...new Set(ids)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-balance:${id}`}))`;
  }

  sourceSums(accountId: string, source: string, sourceId: string, tx: Tx) {
    return tx.journalLine.aggregate({ where: { accountId, entry: { source, sourceId } }, _sum: { debit: true, credit: true } });
  }

  closedMonths(tx: Tx | PrismaClient = this.db) {
    return tx.financePeriod.findMany({ select: { month: true, status: true } });
  }

  closeMonth(month: string, status: string, closedById: string, tx: Tx) {
    return tx.financePeriod.upsert({ where: { month }, create: { month, status, closedById }, update: { status, closedById, closedAt: new Date() } });
  }

  /** (43) the one person with the right edits a manual entry: new date, memo and lines, same number. */
  replaceEntry(id: string, data: { date: Date; memo: string }, lines: LineInput[], tx: Tx) {
    return tx.journalEntry.update({ where: { id }, data: { ...data, lines: { deleteMany: {}, create: lines } }, select: { id: true, no: true } });
  }

  /** An account that gets its first sub-account carries its movements down to «(عام)» (M-07, 4 Nov). */
  moveLines(fromId: string, toId: string, tx: Tx) {
    return tx.journalLine.updateMany({ where: { accountId: fromId }, data: { accountId: toId } });
  }

  archiveAccount(id: string, tx: Tx) {
    return tx.account.update({ where: { id }, data: { archivedAt: new Date() }, select: ACCOUNT });
  }

  createEntry(data: { date: Date; nature: string; source: string; sourceId: string | null; memo: string; createdById: string }, lines: LineInput[], tx: Tx) {
    return tx.journalEntry.create({ data: { ...data, lines: { create: lines } }, select: { id: true, no: true } });
  }

  /** 9.6: what a source posted (a deal's revenue and commissions), with the ids of the entries that already reverse one of them. */
  async posted(source: string, sourceId: string, tx: Tx) {
    const entries = await tx.journalEntry.findMany({ where: { source, sourceId }, orderBy: { no: "asc" }, include: { lines: true } });
    const reversed = await tx.journalEntry.findMany({ where: { source: "reversal", sourceId: { in: entries.map((e) => e.id) } }, select: { sourceId: true } });
    return { entries, reversed: new Set(reversed.map((r) => r.sourceId)) };
  }

  private entryWhere(f: { from?: string | undefined; to?: string | undefined; accountId?: string | undefined; q?: string | undefined }): Prisma.JournalEntryWhereInput {
    return {
      ...(f.from || f.to ? { date: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T00:00:00Z`) } : {}) } } : {}),
      ...(f.accountId ? { lines: { some: { accountId: f.accountId } } } : {}),
      ...(f.q ? { OR: [{ memo: { contains: f.q, mode: "insensitive" } }, { nature: { contains: f.q } }] } : {}),
    };
  }

  entries(f: { from?: string | undefined; to?: string | undefined; accountId?: string | undefined; q?: string | undefined; page: number; pageSize: number }) {
    const where = this.entryWhere(f);
    return this.db.$transaction([
      this.db.journalEntry.findMany({ where, orderBy: [{ date: "desc" }, { no: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { lines: { orderBy: { debit: "desc" } } } }),
      this.db.journalEntry.count({ where }),
      this.db.journalLine.aggregate({ where: { entry: where }, _sum: { debit: true, credit: true } }),
    ]);
  }

  entry(id: string, tx: Tx | PrismaClient = this.db) {
    return tx.journalEntry.findUnique({ where: { id }, include: { lines: { orderBy: { debit: "desc" } } } });
  }

  accountLines(accountId: string) {
    return this.db.journalLine.findMany({ where: { accountId }, include: { entry: true }, orderBy: [{ entry: { date: "asc" } }, { entry: { no: "asc" } }] });
  }

  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }
}
