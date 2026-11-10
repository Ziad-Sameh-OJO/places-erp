import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { MailLogQuery, MailLogRow, Paged } from "@places/contracts";
import { type Channel, NOTIFICATION_EVENTS, channelsFor, eventByKey, eventChannels, mailStatus } from "@places/domain";
import { PRISMA } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUser } from "../auth/current-user.decorator";
import { PushService } from "./push.service";
import { env } from "../../config/env";

export interface Notify {
  event: string;
  text: string;
  link?: string;
  /** specific people (the lead's owner, the account holder…), on top of the rule's roles */
  userIds?: string[];
  /**
   * When «قواعد الليدز» (1.29) names who is told and how: role keys and user ids, and the channels. They replace the
   * event's own rule (the lead events live in the lead rules, demo «notifRules»).
   */
  to?: string[];
  channels?: Channel[];
}

/** The send log's filters (M-14 3.3): «اتقرا» = sent and its in-app copy read; «اتبعت» = sent, not read yet. */
const MAIL_FILTER: Record<NonNullable<MailLogQuery["status"]> | "all", Prisma.MailLogWhereInput> = {
  all: {},
  queued: { status: "queued" },
  failed: { status: "failed" },
  read: { status: "sent", notification: { is: { readAt: { not: null } } } },
  sent: { status: "sent", NOT: { notification: { is: { readAt: { not: null } } } } },
};

/**
 * M-14. Services say what happened; this decides who hears about it and how, from the rule (admin-editable,
 * defaults in @places/domain) and each person's email preference: the bell, the email, and push to every device
 * the person turned it on for (PushService).
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly mail: MailService, private readonly push: PushService, private readonly audit: AuditService) {}

  async rules() {
    const saved = new Map((await this.db.notificationRule.findMany()).map((r) => [r.event, r]));
    return NOTIFICATION_EVENTS.map((e) => {
      const r = saved.get(e.key);
      return { ...e, toRoles: r?.toRoles ?? e.toRoles, channels: eventChannels(e, r?.channels) };
    });
  }

  /** The change and its audit row (with what it was) in one transaction. */
  async setRule(me: CurrentUser, event: string, channels: Channel[]) {
    const e = eventByKey(event);
    if (!e) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const before = await tx.notificationRule.findUnique({ where: { event } });
      const r = await tx.notificationRule.upsert({ where: { event }, create: { event, toRoles: [...e.toRoles], channels }, update: { channels } });
      await this.audit.record({ module: "integrations", entity: "NotificationRule", entityId: event, action: "update", userId: me.id,
        before: { channels: before?.channels ?? [...e.channels] }, after: { channels } }, tx);
      return r;
    });
  }

  async notify(n: Notify) {
    const e = eventByKey(n.event);
    if (!e) throw new Error(`unknown notification event ${n.event}`);
    const rule = (await this.rules()).find((r) => r.key === n.event)!;
    const roles = n.to ?? [...rule.toRoles];
    const people = await this.db.user.findMany({
      where: { status: "ACTIVE", OR: [{ id: { in: [...(n.userIds ?? []), ...(n.to ?? [])] } }, { roles: { some: { role: { key: { in: roles } } } } }] },
      select: { id: true, email: true, emailNotifications: true },
    });
    const pushTo: string[] = [];
    for (const p of people) {
      const ch = channelsFor(n.channels ?? rule.channels, p, e.important);
      const inApp = ch.includes("app") ? await this.db.notification.create({ data: { userId: p.id, text: n.text, link: n.link ?? null, important: e.important, event: e.key } }) : null;
      if (ch.includes("email")) await this.mail.send({ to: p.email, subject: `${e.label} · Places ERP`, text: `${n.text}${n.link ? `\n${env.WEB_ORIGIN}${n.link}` : ""}`, notificationId: inApp?.id });
      if (ch.includes("push")) pushTo.push(p.id);
    }
    // the push is a copy on the phone: it goes out in the background, so a slow push service never slows the action down
    void this.push.send(pushTo, { title: e.label, body: n.text, link: n.link }).catch(() => undefined);
    return people.length;
  }

  /** The bell (M-14 5.1 · 5.3): mine, unread first, by type and read state; `types` = the types I have, for the filter. */
  async mine(userId: string, q: { page: number; pageSize: number; unread: boolean; event?: string | undefined }) {
    const where = { userId, ...(q.unread ? { readAt: null } : {}), ...(q.event ? { event: q.event } : {}) };
    const [items, total, unread, types] = await this.db.$transaction([
      this.db.notification.findMany({ where, orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { userId, readAt: null } }),
      this.db.notification.findMany({ where: { userId, event: { not: null } }, distinct: ["event"], select: { event: true } }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, unread, types: types.map((t) => t.event!) };
  }

  /** Only the owner can mark their own notifications. */
  async read(userId: string, id: string | "all") {
    await this.db.notification.updateMany({ where: { userId, readAt: null, ...(id === "all" ? {} : { id }) }, data: { readAt: new Date() } });
  }

  /** M-14 3.1 · 3.3 · 6.1: the send log, newest first: اتبعت · اتقرا · الإيميل فشل · مستني. */
  /**
   * 12.14 «ابعت إيميل تجربة» (demo admin.js nfTest): one mail to the person pressing it, through the same outbox as every
   * notification, so it shows in «سجل الإيميلات» as sent or failed. It names the sending address set above it.
   */
  async sendTestMail(me: CurrentUser) {
    const row = await this.db.setting.findUnique({ where: { key: "notificationsFrom" } });
    const from = typeof row?.value === "string" && row.value ? row.value : "notifications@places.com";
    await this.mail.send({ to: me.email, subject: "إيميل تجربة · Places ERP", text: `أهلاً ${me.name}،\nده إيميل تجربة من ${from}: الإيميلات اللي السيستم بيبعتها شغالة.` });
    return { to: me.email, from };
  }

  async mailLog(q: MailLogQuery): Promise<Paged<MailLogRow>> {
    const where = MAIL_FILTER[q.status ?? "all"];
    const [rows, total] = await this.db.$transaction([
      this.db.mailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { notification: { select: { readAt: true } } } }),
      this.db.mailLog.count({ where }),
    ]);
    const items = rows.map((r) => {
      const readAt = r.notification?.readAt ?? null;
      return { id: r.id, to: r.to, subject: r.subject, status: mailStatus(r.status, readAt), attempts: r.attempts, error: r.error, createdAt: r.createdAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null, readAt: readAt?.toISOString() ?? null };
    });
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async setPreferences(userId: string, emailNotifications: boolean) {
    await this.db.user.update({ where: { id: userId }, data: { emailNotifications } });
  }
}
