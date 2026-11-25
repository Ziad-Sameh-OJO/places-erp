/**
 * M-14 3.1 «إيميل الإرسال»: the mail server the Super Admin sets on the notifications page (Setting `mailServer`),
 * else the environment's SMTP_URL / MAIL_FROM as before. Shared by the API (the test mail) and the worker (the
 * outbox), which can't import each other. The app password is kept sealed (AES-256-GCM, its key from SESSION_SECRET)
 * and only opened here, to send.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createTransport } from "nodemailer";
import type { PrismaClient } from "@prisma/client";

/** As stored: `password` is sealed. */
export interface SavedMailServer { host: string; port: number; secure: boolean; user: string; password: string; fromName: string }
export interface MailEnv { SMTP_URL?: string | undefined; MAIL_FROM: string; SESSION_SECRET?: string | undefined }
export interface Outgoing { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] | undefined }
/** What to send through, a reason it can't (the saved password can't be opened), or null = nothing set up. */
export type MailRoute = { send: (m: Outgoing) => Promise<void>; from: string; saved: boolean } | { problem: string } | null;

const keyOf = (secret: string) => createHash("sha256").update(`mail-server:${secret}`).digest();

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), data].map((x) => (typeof x === "string" ? x : x.toString("base64"))).join(":");
}

/** null when it was sealed with another key (SESSION_SECRET changed) or isn't a sealed value. */
export function openSecret(sealed: string, secret: string): string | null {
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const isSaved = (v: unknown): v is SavedMailServer =>
  !!v && typeof v === "object" && typeof (v as SavedMailServer).host === "string" && !!(v as SavedMailServer).host && typeof (v as SavedMailServer).password === "string";

export async function savedMailServer(db: Pick<PrismaClient, "setting">): Promise<SavedMailServer | null> {
  const row = await db.setting.findUnique({ where: { key: "mailServer" } });
  return isSaved(row?.value) ? row.value : null;
}

/** The saved server first (with the page's «إيميل الإرسال» as the sender), else the environment's. */
export async function mailRoute(db: Pick<PrismaClient, "setting">, env: MailEnv): Promise<MailRoute> {
  const s = await savedMailServer(db);
  if (s) {
    const pass = env.SESSION_SECRET ? openSecret(s.password, env.SESSION_SECRET) : null;
    if (pass == null) return { problem: "الـ App Password المحفوظ مش بيتقري (مفتاح السيرفر اتغيّر) · اكتبه تاني من صفحة الإشعارات والإيميل" };
    const fromRow = await db.setting.findUnique({ where: { key: "notificationsFrom" } });
    const address = typeof fromRow?.value === "string" && fromRow.value ? fromRow.value : s.user;
    const smtp = createTransport({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass } });
    const from = s.fromName ? `"${s.fromName.replace(/"/g, "")}" <${address}>` : address;
    return { from, saved: true, send: async (m) => { await smtp.sendMail({ from, ...m }); } };
  }
  if (env.SMTP_URL) {
    const smtp = createTransport(env.SMTP_URL);
    return { from: env.MAIL_FROM, saved: false, send: async (m) => { await smtp.sendMail({ from: env.MAIL_FROM, ...m }); } };
  }
  return null;
}
