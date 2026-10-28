import { z } from "zod";

/** The app refuses to start with a missing or malformed setting — fail at boot, not at 2 a.m. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  WEB_ORIGIN: z.string().url(),
});
export type Env = z.infer<typeof Env>;
export const env: Env = Env.parse(process.env);
