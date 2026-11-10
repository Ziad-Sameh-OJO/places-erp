import { existsSync } from "node:fs";
import { z } from "zod";

// locally the settings come from the repo-root .env (scripts run from apps/api); in production from the container
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

/** The app refuses to start with a missing or malformed setting — fail at boot, not at 2 a.m. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  WEB_ORIGIN: z.string().url(), // also the base of links in emails (activation, password reset)
  SMTP_URL: z.string().url().optional(),
  MAIL_FROM: z.string().default("Places ERP <notifications@places.com>"),
  // M-14 (51) push notifications: the VAPID key pair (secrets). Empty = push is off and the rest works as before.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:notifications@places.com"),
  // file storage: MinIO locally (`pnpm files:local`), any S3-compatible store later. The browser talks to it directly.
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
}).refine((e) => e.NODE_ENV !== "production" || !!e.SMTP_URL, { message: "SMTP_URL is required in production", path: ["SMTP_URL"] });
export type Env = z.infer<typeof Env>;
export const env: Env = Env.parse(process.env);
