import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { PRISMA } from "../database/database.module";
import { requestContext } from "./request-context";

export interface AuditEntry {
  module: string; entity: string; entityId: string; action: string;
  userId: string | null; before?: unknown; after?: unknown; ip?: string | undefined;
}

/**
 * Q50: every create / update / delete / reassignment / money change is recorded with the old and new values.
 * Services call record() inside the same transaction as the change, so there is never a change without its trail.
 * The IP and the device (user agent) come from the request being served.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  record(e: AuditEntry, tx: Pick<PrismaClient, "auditLog"> = this.db) {
    const req = requestContext.getStore();
    return tx.auditLog.create({
      data: { module: e.module, entity: e.entity, entityId: e.entityId, action: e.action, userId: e.userId,
        before: (e.before ?? undefined) as never, after: (e.after ?? undefined) as never, ip: e.ip ?? req?.ip ?? null, userAgent: req?.userAgent ?? null },
    });
  }
}
