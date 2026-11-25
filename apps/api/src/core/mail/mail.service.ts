import { Inject, Injectable, Logger } from "@nestjs/common";
import { mkdirSync, writeFileSync } from "node:fs";
import type { PrismaClient } from "@places/db";
import { PRISMA } from "../database/database.module";
import { env } from "../../config/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** The send log's copy when `text` carries a secret (a sign-in code, an activation / reset link): the log never keeps it. */
  logText?: string;
  attachments?: { filename: string; content: Buffer }[];
  /** the in-app copy of the same notification: when it's read, the log shows «اتقرا» (M-14 3.3) */
  notificationId?: string;
}

/**
 * Outgoing email (M-14 2.4). Every mail is written to the send log. In production (and with SMTP_URL, e.g. Mailpit)
 * it is queued there, attachments included, and the worker sends it within a minute through the server set on the
 * notifications page (else SMTP_URL), retrying and telling the Super Admin when it fails (mail-outbox.ts). In
 * development without SMTP_URL it is written to .local/outbox/ at once, so the team (and the e2e tests) can open the
 * links; the page's server is still tried by «ابعت إيميل تجربة».
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async send(m: Mail) {
    const row = { to: m.to, subject: m.subject, text: m.logText ?? m.text, notificationId: m.notificationId ?? null };
    // production always queues: with no server set yet the worker fails it and the Super Admin is told (not the caller)
    if (env.NODE_ENV === "production" || env.SMTP_URL) {
      const attachments = m.attachments?.map((a) => ({ filename: a.filename, base64: a.content.toString("base64") }));
      // the real text rides in secretText until the worker sends it, then it's dropped (mail-outbox.ts)
      await this.db.mailLog.create({ data: { ...row, ...(m.logText !== undefined ? { secretText: m.text } : {}), ...(attachments?.length ? { attachments } : {}) } });
      return;
    }
    const dir = "../../.local/outbox";
    mkdirSync(dir, { recursive: true });
    // attachments by name and size only: the outbox is for reading
    const attachments = m.attachments?.map((a) => ({ filename: a.filename, bytes: a.content.length }));
    writeFileSync(`${dir}/${Date.now()}-${m.to}.json`, JSON.stringify({ to: m.to, subject: m.subject, text: m.text, attachments }, null, 2));
    await this.db.mailLog.create({ data: { ...row, status: "sent", attempts: 1, sentAt: new Date() } });
    this.log.log(`(dev outbox) ${m.to} · ${m.subject}`);
  }
}
