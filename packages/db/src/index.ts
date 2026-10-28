/**
 * @places/db — the Prisma client and the bridge between the database (Decimal EGP) and the domain (integer piasters).
 * Only the API and the worker import this package; the web app never talks to the database.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import type { Piasters } from "@places/domain";

export const prisma = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
export { Prisma };

export const toPiasters = (d: Prisma.Decimal | null | undefined): Piasters => (d ? Math.round(d.mul(100).toNumber()) : 0);
export const fromPiasters = (p: Piasters): Prisma.Decimal => new Prisma.Decimal(p).div(100);
