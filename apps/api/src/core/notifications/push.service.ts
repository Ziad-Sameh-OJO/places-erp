import { Inject, Injectable, Logger } from "@nestjs/common";
import webpush, { WebPushError } from "web-push";
import type { PrismaClient } from "@places/db";
import type { PushSubscriptionInput } from "@places/contracts";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { env } from "../../config/env";

export interface PushMessage { title: string; body: string; link?: string | undefined }

/** The push service says the device is gone (unsubscribed, app removed): its row is dropped. */
const GONE = new Set([404, 410]);

/**
 * M-14 (51): push notifications to every device a person turned them on for (Web Push with VAPID keys from the
 * environment). Without the keys push is simply off. A failed push never fails the notification: the bell has it.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger("Push");
  private readonly on = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService) {
    if (this.on) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
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
  async send(userIds: readonly string[], m: PushMessage): Promise<number> {
    if (!this.on || !userIds.length) return 0;
    const subs = await this.db.pushSubscription.findMany({ where: { userId: { in: [...userIds] } } });
    const payload = JSON.stringify({ title: m.title, body: m.body, link: m.link ?? "/" });
    const results = await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 60 * 60 });
        return true;
      } catch (err) {
        if (err instanceof WebPushError && GONE.has(err.statusCode)) await this.db.pushSubscription.deleteMany({ where: { id: s.id } });
        else this.log.warn(`push to a device of ${s.userId} failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }));
    return results.filter(Boolean).length;
  }

  devices(userId: string) {
    return this.db.pushSubscription.count({ where: { userId } });
  }
}
