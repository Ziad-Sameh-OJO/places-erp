import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@places/db";
import { otpResendWait } from "@places/domain";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { env } from "../../config/env";
import { hashPassword, verifyPassword } from "./password";
import { TokensService, sha256 } from "./tokens.service";

const MAX_FAILED = 5; // M-09: the account locks after 5 wrong passwords
type Meta = { ip?: string | undefined; userAgent?: string | undefined };

/**
 * Sessions are opaque random tokens in an httpOnly, Secure, SameSite=Lax cookie. Only the token's hash is stored,
 * so a database leak doesn't leak live sessions. Signing out or disabling an account deletes its sessions at once.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  /** Step 1. Without OTP it opens the session; with OTP it emails a 6-digit code and returns no session. */
  async login(email: string, password: string, meta: Meta): Promise<{ token: string | null; otpRequired: boolean }> {
    const user = await this.db.user.findUnique({ where: { email } });
    // same message whatever went wrong: don't reveal which emails exist
    const fail = () => new UnauthorizedException("الإيميل أو الباسورد غلط");
    if (!user || !user.passwordHash || user.status === "DISABLED" || user.status === "INVITED" || ended(user.endDate)) throw fail();
    if (user.status === "LOCKED") throw new UnauthorizedException("الحساب مقفول · كلّم الأدمن");
    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      await this.db.user.update({ where: { id: user.id }, data: { failedLogins: failed, status: failed >= MAX_FAILED ? "LOCKED" : user.status } });
      if (failed >= MAX_FAILED) await this.audit.record({ module: "access", entity: "User", entityId: user.id, action: "locked", userId: null, ip: meta.ip });
      throw fail();
    }
    if (user.otpRequired) {
      await this.sendOtp(user.id, user.email);
      return { token: null, otpRequired: true };
    }
    return { token: await this.openSession(user.id, meta), otpRequired: false };
  }

  private async sendOtp(userId: string, email: string) {
    const code = await this.tokens.issue(userId, "OTP");
    await this.mail.send({ to: email, subject: `كود الدخول: ${code}`, text: `كود الدخول على Places ERP: ${code}\nصالح 10 دقايق. لو مش إنت اللي بتحاول تدخل، غيّر الباسورد.` });
  }

  /**
   * «ابعت كود تاني» (M-09 2.4): only while a sign-in is waiting for its code (the password step passed and the
   * code is still live), and only a minute after the last one. Unknown email and no sign-in in progress get the
   * same answer, so it doesn't reveal which emails exist. The new code replaces the old one.
   */
  async resendOtp(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    const sentAt = user && user.status === "ACTIVE" && user.otpRequired ? await this.tokens.liveSince(user.id, "OTP") : null;
    if (!user || !sentAt) throw new BadRequestException("الكود خلص · ارجع وادخل بالباسورد تاني");
    const wait = otpResendWait(sentAt, new Date());
    if (wait > 0) throw new HttpException(`تقدر تطلب كود تاني بعد ${wait} ثانية`, HttpStatus.TOO_MANY_REQUESTS);
    await this.sendOtp(user.id, user.email);
  }

  /** Step 2 (only for people with OTP on). */
  async verifyOtp(email: string, code: string, meta: Meta) {
    const user = await this.db.user.findUnique({ where: { email } });
    const userId = user && user.status === "ACTIVE" ? await this.tokens.consume(code, "OTP", user.id) : null;
    if (!userId) throw new UnauthorizedException("الكود غلط أو خلص");
    return this.openSession(userId, meta);
  }

  private async openSession(userId: string, meta: Meta) {
    const token = randomBytes(32).toString("base64url");
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { failedLogins: 0, lastLoginAt: new Date() } }),
      this.db.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 36e5), ip: meta.ip ?? null, userAgent: meta.userAgent ?? null } }),
    ]);
    await this.audit.record({ module: "access", entity: "User", entityId: userId, action: "login", userId, ip: meta.ip });
    return token;
  }

  async resolve(token: string | undefined) {
    if (!token) return null;
    const s = await this.db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
    if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE" || ended(s.user.endDate)) return null;
    return s.user;
  }

  logout(token: string) {
    return this.db.session.deleteMany({ where: { id: sha256(token) } });
  }

  /** Activation link (new account) and reset link (forgot / admin) both end here: set the password, sign in fresh. */
  async setPassword(token: string, password: string, kind: "INVITE" | "RESET") {
    const userId = await this.tokens.consume(token, kind);
    if (!userId) throw new BadRequestException("اللينك خلص أو اتستخدم قبل كده");
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), status: "ACTIVE", failedLogins: 0 } }),
      this.db.session.deleteMany({ where: { userId } }),
    ]);
    await this.audit.record({ module: "access", entity: "User", entityId: userId, action: kind === "INVITE" ? "activated" : "password-reset", userId });
  }

  /** Always answers the same, whether the email exists or not. A locked account is unlocked by its reset. */
  async forgot(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (user && user.status !== "DISABLED" && user.status !== "INVITED") await this.sendReset(user.id, user.email);
  }

  async sendReset(userId: string, email: string) {
    const t = await this.tokens.issue(userId, "RESET");
    await this.mail.send({ to: email, subject: "تغيير الباسورد · Places ERP", text: `علشان تعمل باسورد جديد افتح اللينك ده (صالح 30 دقيقة):\n${env.WEB_ORIGIN}/reset?token=${t}\nلو مش إنت اللي طلبت، تجاهل الإيميل.` });
  }

  async sendInvite(userId: string, email: string, roleLabel: string) {
    const t = await this.tokens.issue(userId, "INVITE");
    await this.mail.send({ to: email, subject: "فعّل حسابك على Places ERP", text: `اتعملك حساب بدور ${roleLabel}. افتح اللينك ده واعمل الباسورد بتاعك (صالح 7 أيام):\n${env.WEB_ORIGIN}/activate?token=${t}` });
  }

  async changePassword(userId: string, current: string, next: string, keepToken: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) throw new BadRequestException("الباسورد الحالي غلط");
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
      // every other device is signed out; this one stays
      this.db.session.deleteMany({ where: { userId, id: { not: sha256(keepToken) } } }),
    ]);
    await this.audit.record({ module: "access", entity: "User", entityId: userId, action: "password-changed", userId });
  }
}

/** The last working day is inclusive: the account stops the day after. */
const ended = (endDate: Date | null) => !!endDate && endDate.getTime() + 24 * 36e5 <= Date.now();
