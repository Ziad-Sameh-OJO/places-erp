/**
 * M-14 (51) · 12.10: Web Push to every device a person turned it on for (the PushSubscription table). Shared by the
 * API (NotificationsService) and the worker (its jobs' Alarms), which can't import each other.
 */
import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";

export interface PushMessage { title: string; body: string; link?: string | undefined }
export interface PushKeys { publicKey?: string | undefined; privateKey?: string | undefined; subject: string }
export interface PushDevice { endpoint: string; keys: { p256dh: string; auth: string } }
/** Delivers one payload to one device; throws with `statusCode` when the push service refuses it. */
export type PushTransport = (device: PushDevice, payload: string) => Promise<unknown>;
/** Sends to every device of these people; resolves to how many devices it reached. */
export type PushSend = (userIds: readonly string[], m: PushMessage) => Promise<number>;

/** The push service says the device is gone (unsubscribed, app removed): its row is dropped. */
const GONE = new Set([404, 410]);
const DAY_S = 24 * 60 * 60;

/** Web Push signed with the VAPID key pair from the environment; without the keys push is off (null). */
export function webPushTransport(k: PushKeys): PushTransport | null {
  if (!k.publicKey || !k.privateKey) return null;
  const vapidDetails = { subject: k.subject, publicKey: k.publicKey, privateKey: k.privateKey };
  return (device, payload) => webpush.sendNotification(device, payload, { TTL: DAY_S, vapidDetails });
}

/** A failed push never fails the caller: the bell already has the notification. */
export function pushSender(db: PrismaClient, transport: PushTransport | null, warn: (msg: string) => void = console.warn): PushSend {
  return async (userIds, m) => {
    if (!transport || !userIds.length) return 0;
    const subs = await db.pushSubscription.findMany({ where: { userId: { in: [...userIds] } } });
    const payload = JSON.stringify({ title: m.title, body: m.body, link: m.link ?? "/" });
    const results = await Promise.all(subs.map(async (s) => {
      try {
        await transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        return true;
      } catch (err) {
        const status = (err as { statusCode?: unknown } | null)?.statusCode;
        if (typeof status === "number" && GONE.has(status)) await db.pushSubscription.deleteMany({ where: { id: s.id } });
        else warn(`push to a device of ${s.userId} failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }));
    return results.filter(Boolean).length;
  };
}
