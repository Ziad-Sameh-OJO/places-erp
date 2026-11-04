import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { type Channel, NOTIFICATION_EVENTS, channelsFor, eventByKey } from "@places/domain";
import { PRISMA } from "../database/database.module";
import { MailService } from "../mail/mail.service";
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

/**
 * M-14. Services say what happened; this decides who hears about it and how, from the rule (admin-editable,
 * defaults in @places/domain) and each person's email preference. Push is added with the PWA (VAPID keys).
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly mail: MailService) {}

  async rules() {
    const saved = new Map((await this.db.notificationRule.findMany()).map((r) => [r.event, r]));
    return NOTIFICATION_EVENTS.map((e) => {
      const r = saved.get(e.key);
      return { ...e, toRoles: r?.toRoles ?? e.toRoles, channels: (r?.channels ?? e.channels) as Channel[] };
    });
  }

  async setRule(event: string, channels: Channel[]) {
    const e = eventByKey(event);
    if (!e) throw new NotFoundException();
    return this.db.notificationRule.upsert({ where: { event }, create: { event, toRoles: [...e.toRoles], channels }, update: { channels } });
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
    for (const p of people) {
      const ch = channelsFor(n.channels ?? rule.channels, p, e.important);
      if (ch.includes("app")) await this.db.notification.create({ data: { userId: p.id, text: n.text, link: n.link ?? null, important: e.important } });
      if (ch.includes("email")) await this.mail.send({ to: p.email, subject: `${e.label} · Places ERP`, text: `${n.text}${n.link ? `\n${env.WEB_ORIGIN}${n.link}` : ""}` });
    }
    return people.length;
  }

  async mine(userId: string, page: number, pageSize: number, unreadOnly: boolean) {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await this.db.$transaction([
      this.db.notification.findMany({ where, orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, page, pageSize, unread };
  }

  /** Only the owner can mark their own notifications. */
  async read(userId: string, id: string | "all") {
    await this.db.notification.updateMany({ where: { userId, readAt: null, ...(id === "all" ? {} : { id }) }, data: { readAt: new Date() } });
  }

  async setPreferences(userId: string, emailNotifications: boolean) {
    await this.db.user.update({ where: { id: userId }, data: { emailNotifications } });
  }
}
