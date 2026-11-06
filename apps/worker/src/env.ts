import { existsSync } from "node:fs";
import { z } from "zod";

// locally the settings come from the repo-root .env (scripts run from apps/worker); in production from the environment
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

/** The worker refuses to start with a missing or malformed setting, like the API. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  // M-14 2.4: the worker sends the queued emails; without SMTP (development) it writes them to .local/outbox/
  SMTP_URL: z.string().url().optional(),
  MAIL_FROM: z.string().default("Places ERP <notifications@places.com>"),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
  // M-14 (51) push: the same VAPID key pair as the API. Empty = push is off and the rest works as before.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:notifications@places.com"),
});
export const env = Env.parse(process.env);
