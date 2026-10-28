import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { env } from "../../config/env";
import { verifyPassword } from "./password";

const MAX_FAILED = 5; // M-09: the account locks after 5 wrong passwords
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Sessions are opaque random tokens in an httpOnly, Secure, SameSite=Lax cookie. Only the token's hash is stored,
 * so a database leak doesn't leak live sessions. Signing out or disabling an account deletes its sessions at once.
 */
@Injectable()
export class AuthService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // same message whatever went wrong: don't reveal which emails exist
    const fail = () => new UnauthorizedException("الإيميل أو الباسورد غلط");
    if (!user || !user.passwordHash || user.status === "DISABLED" || user.status === "INVITED") throw fail();
    if (user.status === "LOCKED") throw new UnauthorizedException("الحساب مقفول · كلّم الأدمن");
    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      await this.db.user.update({ where: { id: user.id }, data: { failedLogins: failed, status: failed >= MAX_FAILED ? "LOCKED" : user.status } });
      if (failed >= MAX_FAILED) await this.audit.record({ module: "access", entity: "User", entityId: user.id, action: "locked", userId: null });
      throw fail();
    }
    const token = randomBytes(32).toString("base64url");
    await this.db.$transaction([
      this.db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lastLoginAt: new Date() } }),
      this.db.session.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 36e5), ip: meta.ip ?? null, userAgent: meta.userAgent ?? null } }),
    ]);
    await this.audit.record({ module: "access", entity: "User", entityId: user.id, action: "login", userId: user.id, ip: meta.ip });
    return { token, otpRequired: user.otpRequired };
  }

  async resolve(token: string | undefined) {
    if (!token) return null;
    const s = await this.db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
    if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE") return null;
    return s.user;
  }

  logout(token: string) {
    return this.db.session.deleteMany({ where: { id: sha256(token) } });
  }
}
