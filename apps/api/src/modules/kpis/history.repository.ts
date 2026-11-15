import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Data access only for the hand-typed figures of past quarters (14.12). */
@Injectable()
export class HistoryRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(period: string) {
    return this.db.historicalFigure.findMany({ where: { period }, orderBy: [{ employeeId: "asc" }, { kind: "asc" }] });
  }

  one(id: string, tx: Tx = this.db) {
    return tx.historicalFigure.findUnique({ where: { id } });
  }

  find(period: string, employeeId: string, kind: string, tx: Tx) {
    return tx.historicalFigure.findUnique({ where: { period_employeeId_kind: { period, employeeId, kind } } });
  }

  save(data: { period: string; employeeId: string; kind: string; value: string; note: string | null; createdById: string }, tx: Tx) {
    const { period, employeeId, kind, value, note, createdById } = data;
    return tx.historicalFigure.upsert({ where: { period_employeeId_kind: { period, employeeId, kind } }, create: data, update: { value, note, createdById } });
  }

  remove(id: string, tx: Tx) {
    return tx.historicalFigure.delete({ where: { id } });
  }

  /** Everyone, a person who left included: a past quarter's figures can be theirs. */
  people() {
    return this.db.employee.findMany({ select: { id: true, name: true, userId: true }, orderBy: { name: "asc" } });
  }
}
