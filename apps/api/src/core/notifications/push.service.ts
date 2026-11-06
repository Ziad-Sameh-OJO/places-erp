import { Inject, Injectable, Logger } from "@nestjs/common";
import { type PrismaClient, type PushMessage, type PushSend, pushSender, webPushTransport } from "@places/db";
import type { PushSubscriptionInput } from "@places/contracts";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { env } from "../../config/env";

/**
 * M-14 (51): push notifications to every device a person turned them on for (Web Push with VAPID keys from the
 * environment). Without the keys push is simply off. A failed push never fails the notification: the bell has it.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger("Push");
  private readonly on = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  // the sender is shared with the worker (@places/db), so a job's Alarm reaches the phone the same way
  private readonly sender: PushSend;

  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService) {
    const transport = webPushTransport({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
    this.sender = pushSender(db, transport, (m) => this.log.warn(m));
  }

  publicKey(): string | null {
    return this.on ? env.VAPID_PUBLIC_KEY! : null;
  }

  /** This device, for this person (a device another account used moves to this one). Audited. */
  async subscribe(userId: string, s: PushSubscriptionInput) {
    await this.db.$transaction(async (tx) => {
      const row = await tx.pushSubscription.upsert({
        where: { endpoint: s.endpoint },
        create: { userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
        update: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth },
      });
      await this.audit.record({ module: "integrations", entity: "PushSubscription", entityId: row.id, action: "create", userId }, tx);
    });
  }

  /** Only one's own device. Audited when there was one. */
  async unsubscribe(userId: string, endpoint: string) {
    await this.db.$transaction(async (tx) => {
      const row = await tx.pushSubscription.findFirst({ where: { endpoint, userId } });
      if (!row) return;
      await tx.pushSubscription.delete({ where: { id: row.id } });
      await this.audit.record({ module: "integrations", entity: "PushSubscription", entityId: row.id, action: "delete", userId }, tx);
    });
  }

  /** To every device of these people; returns how many devices it reached. */
  send(userIds: readonly string[], m: PushMessage): Promise<number> {
    return this.sender(userIds, m);
  }

  devices(userId: string) {
    return this.db.pushSubscription.count({ where: { userId } });
  }
}
