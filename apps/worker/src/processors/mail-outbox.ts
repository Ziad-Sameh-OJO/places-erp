/**
 * M-14 2.3 · 2.4: sends the queued emails (MailService.send queues them) within a minute. A failed send is tried
 * again later (afterMailFailure); after the last try the mail is «الإيميل فشل» and the Super Admin is told in the
 * system (event mail.failed), while the notification itself stays in the bell. Email goes out at any hour: it's the
 * copy of a notification that already appeared, so working hours don't apply.
 * Idempotent: each mail is claimed (attempts + 1, next try pushed ahead) before it is sent, so a rerun or a second
 * worker never sends it twice; a crash mid-send leaves it to be retried after the wait.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createTransport } from "nodemailer";
import { Prisma, prisma } from "@places/db";
import { MAIL_RETRY_MINUTES, afterMailFailure, eventByKey } from "@places/domain";

export interface OutgoingMail { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] | undefined }
export type SendMail = (m: OutgoingMail) => Promise<void>;

/** What MailService queued: the files as base64. */
const attachmentsOf = (raw: unknown): OutgoingMail["attachments"] =>
  Array.isArray(raw) ? raw.map((a: { filename: string; base64: string }) => ({ filename: a.filename, content: Buffer.from(a.base64, "base64") })) : undefined;

/** One minute's batch: a backlog drains over the next minutes instead of one long job. */
const BATCH = 100;

/** SMTP when configured; otherwise (development) the same .local/outbox/ the API writes to. */
export function mailSender(cfg: { SMTP_URL?: string | undefined; MAIL_FROM: string }): SendMail {
  if (cfg.SMTP_URL) {
    const smtp = createTransport(cfg.SMTP_URL);
    return async (m) => { await smtp.sendMail({ from: cfg.MAIL_FROM, ...m }); };
  }
  return async (m) => {
    mkdirSync("../../.local/outbox", { recursive: true });
    const attachments = m.attachments?.map((a) => ({ filename: a.filename, bytes: a.content.length }));
    writeFileSync(`../../.local/outbox/${Date.now()}-${m.to}.json`, JSON.stringify({ ...m, attachments }, null, 2));
  };
}

export async function mailOutboxTick(send: SendMail, now = new Date()): Promise<void> {
  const due = await prisma.mailLog.findMany({ where: { status: "queued", nextAttemptAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: BATCH });
  for (const m of due) {
    const claimed = await prisma.mailLog.updateMany({
      where: { id: m.id, status: "queued", attempts: m.attempts },
      data: { attempts: m.attempts + 1, nextAttemptAt: new Date(now.getTime() + MAIL_RETRY_MINUTES * 60_000) },
    });
    if (!claimed.count) continue;
    try {
      await send({ to: m.to, subject: m.subject, text: m.text, attachments: attachmentsOf(m.attachments) });
      // the files aren't kept once sent: the log needs the line, not the PDF
      await prisma.mailLog.update({ where: { id: m.id }, data: { status: "sent", sentAt: now, error: null, attachments: Prisma.DbNull } });
    } catch (err) {
      await failed(m, m.attempts + 1, err instanceof Error ? err.message : String(err), now);
    }
  }
}

async function failed(m: { id: string; to: string; subject: string }, attempts: number, error: string, now: Date) {
  const next = afterMailFailure(attempts, now);
  const message = error.slice(0, 500);
  if (next.status === "queued") {
    await prisma.mailLog.update({ where: { id: m.id }, data: { error: message, nextAttemptAt: next.nextAttemptAt } });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.mailLog.update({ where: { id: m.id }, data: { status: "failed", error: message } });
    const e = eventByKey("mail.failed")!;
    const rule = await tx.notificationRule.findUnique({ where: { event: e.key } });
    if (!(rule?.channels ?? e.channels).includes("app")) return;
    const admins = await tx.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: rule?.toRoles ?? [...e.toRoles] } } } } }, select: { id: true } });
    // M-14 7.1 «إيميل موظف غلط»: the Super Admin hears of it; the person still has the notification in the bell
    await tx.notification.createMany({ data: admins.map((a) => ({ userId: a.id, event: e.key, text: `${e.label}: «${m.subject}» لـ ${m.to} · ${message}`, link: "/integrations", important: e.important })) });
  });
}
