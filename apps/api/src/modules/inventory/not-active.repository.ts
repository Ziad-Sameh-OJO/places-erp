import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** Data access only for the Not Active sheets (M-03 1.1). */
@Injectable()
export class NotActiveRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  sheets() {
    return this.db.notActiveSheet.findMany({ select: { id: true, name: true, dedupeBy: true, columns: true, _count: { select: { rows: true } } }, orderBy: { createdAt: "asc" } });
  }

  sheet(id: string) {
    return this.db.notActiveSheet.findUnique({ where: { id }, select: { id: true, name: true, dedupeBy: true, columns: true, _count: { select: { rows: true } } } });
  }

  /** «CFC» and «cfc» are the same sheet. */
  sheetByName(name: string, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveSheet.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true, dedupeBy: true, columns: true, _count: { select: { rows: true } } } });
  }

  /** What the merge compares against: every row's cells. */
  rowData(sheetId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.notActiveRow.findMany({ where: { sheetId }, select: { data: true } });
  }

  rows(sheetId: string, skip: number, take: number) {
    const where = { sheetId };
    return this.db.$transaction([
      this.db.notActiveRow.findMany({ where, select: { id: true, data: true, status: true, feedback: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take }),
      this.db.notActiveRow.count({ where }),
    ]);
  }

  createSheet(tx: Prisma.TransactionClient, name: string, dedupeBy: string, columns: string[]) {
    return tx.notActiveSheet.create({ data: { name, dedupeBy, columns }, select: { id: true, name: true, dedupeBy: true, columns: true } });
  }

  updateSheet(tx: Prisma.TransactionClient, id: string, dedupeBy: string, columns: string[]) {
    return tx.notActiveSheet.update({ where: { id }, data: { dedupeBy, columns } });
  }

  /** The database's unique (sheet, key) is the last word: a row that slipped in meanwhile is skipped, not doubled. */
  addRows(tx: Prisma.TransactionClient, sheetId: string, rows: readonly { key: string; data: Record<string, string> }[]) {
    return tx.notActiveRow.createMany({ data: rows.map((r) => ({ sheetId, dedupeKey: r.key, data: r.data })), skipDuplicates: true });
  }
}
