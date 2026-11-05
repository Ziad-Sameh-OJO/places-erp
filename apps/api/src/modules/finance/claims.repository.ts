import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";
import type { Tx } from "./ledger.repository";

export const CLAIM_INCLUDE = { entity: { select: { id: true, name: true } }, move: { select: { id: true, no: true } } } as const;
export type ClaimRow = Prisma.ClaimGetPayload<{ include: typeof CLAIM_INCLUDE }>;

/** Prisma only: claims (9.17). No decisions here. */
@Injectable()
export class ClaimsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(where: Prisma.ClaimWhereInput) {
    return this.db.claim.findMany({ where, include: CLAIM_INCLUDE, orderBy: { no: "desc" }, take: 200 });
  }

  find(where: Prisma.ClaimWhereInput, tx?: Tx) {
    return (tx ?? this.db).claim.findFirst({ where, include: CLAIM_INCLUDE });
  }

  create(data: Prisma.ClaimUncheckedCreateInput, tx: Tx) {
    return tx.claim.create({ data, include: CLAIM_INCLUDE });
  }

  update(id: string, data: Prisma.ClaimUncheckedUpdateInput, tx: Tx) {
    return tx.claim.update({ where: { id }, data, include: CLAIM_INCLUDE });
  }

  entity(id: string, tx: Tx) {
    return tx.entity.findUnique({ where: { id } });
  }

  /** The next receipt serial (RC-<n>); the unique index refuses a twin if two are collected at the same instant. */
  async nextReceiptNo(tx: Tx) {
    return ((await tx.claim.aggregate({ _max: { receiptNo: true } }))._max.receiptNo ?? 0) + 1;
  }

  accountKind(id: string, tx: Tx) {
    return tx.account.findUnique({ where: { id }, select: { kind: true } });
  }

  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }
}
