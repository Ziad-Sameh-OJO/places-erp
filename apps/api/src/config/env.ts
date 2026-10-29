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
});
export type Env = z.infer<typeof Env>;
export const env: Env = Env.parse(process.env);
