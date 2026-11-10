import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { NotActiveTab } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

const SHEET = {
  id: true, name: true, dedupeBy: true, numberBy: true, columns: true, folder: true, createdById: true, createdAt: true, _count: { select: { rows: true } },
} satisfies Prisma.NotActiveSheetSelect;
const ROW = {
  id: true, sheetId: true, data: true, status: true, feedback: true, createdAt: true, assignedTo: true, matchedUnitId: true, matchSeen: true, unitId: true,
} satisfies Prisma.NotActiveRowSelect;
export type NotActiveRowRecord = Prisma.NotActiveRowGetPayload<{ select: typeof ROW }>;

/** Who sees which rows: Manar all of them; the person she sends rows to, those rows (M-03 1.1). */
export interface RowScope { all: boolean; userId: string }
// «not Done» must keep the rows not classified yet: SQL drops NULLs from status <> 'Done'
const NOT_DONE: Prisma.NotActiveRowWhereInput = { OR: [{ status: null }, { status: { not: "Done" } }] };
const scoped = (s: RowScope): Prisma.NotActiveRowWhereInput => (s.all ? {} : { assignedTo: s.userId });

/** Data access only for the Not Active sheets (M-03 1.1). */
@Injectable()
export class NotActiveRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** 2.39 · the files the person sees: Manar all of them, the others the ones with rows sent to them. */
  sheets(s: RowScope) {
    // the row count is the reader's rows (Marwa sees only what was sent to her)
    return this.db.notActiveSheet.findMany({
      where: s.all ? {} : { rows: { some: { assignedTo: s.userId } } }, select: { ...SHEET, _count: { select: { rows: { where: scoped(s) } } } }, orderBy: { createdAt: "asc" },
    });
  }

  /** Per file: rows not classified yet, and numbers in the inventory waiting for Manar — in what the person sees. */
  sheetCounts(s: RowScope) {
    return this.db.$transaction([
      this.db.notActiveRow.groupBy({ by: ["sheetId"], where: { status: null, ...scoped(s) }, _count: { _all: true }, orderBy: { sheetId: "asc" } }),
      this.db.notActiveRow.groupBy({ by: ["sheetId"], where: { matchedUnitId: { not: null }, matchSeen: false, ...scoped(s) }, _count: { _all: true }, orderBy: { sheetId: "asc" } }),
    ]);
  }

  folders() {
    return this.db.notActiveSheet.findMany({ where: { folder: { not: null } }, select: { folder: true }, distinct: ["folder"] });
  }

  /** 2.39 · a new, empty file: its columns and the column that tells rows apart come with its first sheet. */
  createFile(tx: Prisma.TransactionClient, name: string, folder: string | null, createdById: string) {
    return tx.notActiveSheet.create({ data: { name, folder, createdById }, select: SHEET });
  }

  renameFile(tx: Prisma.TransactionClient, id: string, name: string, folder: string | null) {
    return tx.notActiveSheet.update({ where: { id }, data: { name, folder }, select: SHEET });
  }

  sheet(id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveSheet.findUnique({ where: { id }, select: SHEET });
  }

  /** «CFC» and «cfc» are the same sheet. */
  sheetByName(name: string, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveSheet.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: SHEET });
  }

  /** What the merge compares against: every row's cells. */
  rowData(sheetId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveRow.findMany({ where: { sheetId }, select: { data: true } });
  }

  rows(sheetId: string, s: RowScope, tab: NotActiveTab, skip: number, take: number) {
    const where: Prisma.NotActiveRowWhereInput = { sheetId, ...scoped(s), ...(tab === "all" ? {} : { status: tab }) };
    return this.db.$transaction([
      this.db.notActiveRow.findMany({ where, select: ROW, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take }),
      this.db.notActiveRow.count({ where }),
    ]);
  }

  /** all · No Answer · Not True · Done · not classified yet · in the inventory and waiting for Manar. */
  counts(sheetId: string, s: RowScope) {
    const count = (w: Prisma.NotActiveRowWhereInput) => this.db.notActiveRow.count({ where: { sheetId, ...scoped(s), ...w } });
    return this.db.$transaction([
      count({}), count({ status: "No Answer" }), count({ status: "Not True" }), count({ status: "Done" }), count({ status: null }),
      count({ matchedUnitId: { not: null }, matchSeen: false }),
    ]);
  }

  row(id: string, s: RowScope, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveRow.findFirst({ where: { id, ...scoped(s) }, select: ROW });
  }

  createSheet(tx: Prisma.TransactionClient, name: string, dedupeBy: string, numberBy: string | null, columns: string[], createdById: string) {
    return tx.notActiveSheet.create({ data: { name, dedupeBy, numberBy, columns, createdById }, select: SHEET });
  }

  updateSheet(tx: Prisma.TransactionClient, id: string, dedupeBy: string, numberBy: string | null, columns: string[]) {
    return tx.notActiveSheet.update({ where: { id }, data: { dedupeBy, numberBy, columns } });
  }

  /** The database's unique (sheet, key) is the last word: a row that slipped in meanwhile is skipped, not doubled. */
  addRows(tx: Prisma.TransactionClient, sheetId: string, rows: readonly { key: string; data: Record<string, string> }[]) {
    return tx.notActiveRow.createMany({ data: rows.map((r) => ({ sheetId, dedupeKey: r.key, data: r.data })), skipDuplicates: true });
  }

  /** Rows not compared with the inventory yet (new ones, or ones that didn't match before). */
  unmatched(sheetId: string) {
    return this.db.notActiveRow.findMany({ where: { sheetId, matchedUnitId: null, status: null }, select: { id: true, data: true } });
  }

  setMatch(tx: Prisma.TransactionClient, id: string, unitId: string) {
    return tx.notActiveRow.update({ where: { id }, data: { matchedUnitId: unitId } });
  }

  assign(tx: Prisma.TransactionClient, sheetId: string, rowIds: string[], to: string) {
    return tx.notActiveRow.updateMany({ where: { sheetId, id: { in: rowIds }, ...NOT_DONE }, data: { assignedTo: to } });
  }

  classify(tx: Prisma.TransactionClient, id: string, data: { status: string; feedback: string | null; matchSeen: boolean }) {
    return tx.notActiveRow.updateMany({ where: { id, ...NOT_DONE }, data });
  }

  /** Done is claimed before the unit is made, so two people can't turn the same row into two units. */
  claimDone(id: string) {
    return this.db.notActiveRow.updateMany({ where: { id, ...NOT_DONE }, data: { status: "Done", feedback: null } });
  }

  setUnit(tx: Prisma.TransactionClient, id: string, unitId: string) {
    return tx.notActiveRow.update({ where: { id }, data: { unitId } });
  }

  restore(id: string, status: string | null, feedback: string | null) {
    return this.db.notActiveRow.update({ where: { id }, data: { status, feedback } });
  }

  /** The team rows are sent to: active people whose role works the rows («edit») without managing them («approve»). */
  assignees() {
    const works = { module: "notactive", actions: { has: "edit" }, NOT: { actions: { has: "approve" } } } satisfies Prisma.RolePermissionWhereInput;
    return this.db.employee.findMany({
      where: { user: { status: "ACTIVE", roles: { some: { role: { permissions: { some: works } } } } } },
      select: { userId: true, name: true }, orderBy: { name: "asc" },
    });
  }

  names(userIds: string[]) {
    return userIds.length ? this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } }) : Promise.resolve([]);
  }
}
