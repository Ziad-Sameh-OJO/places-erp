import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { PRISMA } from "../database/database.module";

export interface AuditEntry {
  module: string; entity: string; entityId: string; action: string;
  userId: string | null; before?: unknown; after?: unknown; ip?: string | undefined;
}

/**
 * Q50: every create / update / delete / reassignment / money change is recorded with the old and new values.
 * Services call record() inside the same transaction as the change, so there is never a change without its trail.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  record(e: AuditEntry, tx: Pick<PrismaClient, "auditLog"> = this.db) {
    return tx.auditLog.create({
      data: { module: e.module, entity: e.entity, entityId: e.entityId, action: e.action, userId: e.userId,
        before: (e.before ?? undefined) as never, after: (e.after ?? undefined) as never, ip: e.ip ?? null },
    });
  }
}
