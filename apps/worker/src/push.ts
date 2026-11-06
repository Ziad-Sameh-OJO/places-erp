/**
 * M-14 (51) · 12.10: the jobs write their notifications straight into the bell, so this sends the phone copy the
 * way the API's notify() does — same decision (pushRecipients) and same sender (@places/db). Called after the job's
 * transaction commits: a rolled-back Alarm never reaches a phone, and a slow push service never holds a lock.
 */
import { prisma, type PushSend } from "@places/db";
import { type Channel, eventByKey, eventChannels, pushRecipients } from "@places/domain";

let sender: PushSend = async () => 0;

/** main.ts plugs in Web Push (VAPID keys from the environment); a test plugs in a fake transport. */
export function usePushSender(s: PushSend): void {
  sender = s;
}

export interface PushNote { readonly userIds: readonly string[]; readonly text: string; readonly link?: string | null | undefined }

/** On channels already decided (a lead rule's «ch», 1.29), titled like its email. Returns the devices reached. */
export async function pushOnChannels(channels: readonly Channel[], important: boolean, title: string, n: PushNote): Promise<number> {
  if (!channels.includes("push") || !n.userIds.length) return 0;
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(n.userIds)] }, status: "ACTIVE" }, select: { id: true, emailNotifications: true } });
  const to = pushRecipients(channels, people, important);
  try {
    return await sender(to, { title, body: n.text, link: n.link ?? undefined });
  } catch (err) {
    // the bell already has it: a push failure never fails the job (it would retry and write the Alarm twice)
    console.warn(`push failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

/** For an event (M-14): its channels from the admin's rule, else the event's default. */
export async function pushEvent(event: string, n: PushNote): Promise<number> {
  const e = eventByKey(event);
  if (!e) throw new Error(`unknown notification event ${event}`);
  const saved = await prisma.notificationRule.findUnique({ where: { event }, select: { channels: true } });
  return pushOnChannels(eventChannels(e, saved?.channels), e.important, e.label, n);
}
