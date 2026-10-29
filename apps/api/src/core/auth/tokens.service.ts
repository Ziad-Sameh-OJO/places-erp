import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { PrismaClient } from "@places/db";
import { PRISMA } from "../database/database.module";

export type TokenKind = "INVITE" | "RESET" | "OTP";
const TTL_MIN: Record<TokenKind, number> = { INVITE: 7 * 24 * 60, RESET: 30, OTP: 10 };
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * One-time secrets sent by email. Only hashes are stored; issuing a new one cancels the previous of the same
 * kind, and a token works once. OTP codes are short, so they are bound to the user (hash of userId:code).
 */
@Injectable()
export class TokensService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async issue(userId: string, kind: TokenKind): Promise<string> {
    const secret = kind === "OTP" ? String(randomInt(100_000, 1_000_000)) : randomBytes(32).toString("base64url");
    const id = sha256(kind === "OTP" ? `${userId}:${secret}` : secret);
    await this.db.$transaction([
      this.db.authToken.deleteMany({ where: { userId, kind } }),
      this.db.authToken.create({ data: { id, userId, kind, expiresAt: new Date(Date.now() + TTL_MIN[kind] * 60_000) } }),
    ]);
    return secret;
  }

  /** Returns the userId and burns the token, or null if it is unknown, expired or already used. */
  async consume(secret: string, kind: TokenKind, userId?: string): Promise<string | null> {
    const id = sha256(kind === "OTP" ? `${userId}:${secret}` : secret);
    const used = await this.db.authToken.updateMany({ where: { id, kind, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (used.count === 0) return null;
    return (await this.db.authToken.findUniqueOrThrow({ where: { id } })).userId;
  }
}
