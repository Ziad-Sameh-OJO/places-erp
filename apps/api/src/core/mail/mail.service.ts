import { Injectable, Logger } from "@nestjs/common";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTransport, type Transporter } from "nodemailer";
import { env } from "../../config/env";

export interface Mail { to: string; subject: string; text: string }

/**
 * Outgoing email. With SMTP_URL (Mailpit locally, SES / SMTP in production) it really sends; without it, in
 * development, each mail is written to .local/outbox/ so the team (and the e2e tests) can open the links.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");
  private readonly smtp: Transporter | null = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;

  async send(m: Mail) {
    if (this.smtp) {
      await this.smtp.sendMail({ from: env.MAIL_FROM, to: m.to, subject: m.subject, text: m.text });
      return;
    }
    if (env.NODE_ENV === "production") throw new Error("SMTP_URL is required in production");
    const dir = "../../.local/outbox";
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${Date.now()}-${m.to}.json`, JSON.stringify(m, null, 2));
    this.log.log(`(dev outbox) ${m.to} · ${m.subject}`);
  }
}
