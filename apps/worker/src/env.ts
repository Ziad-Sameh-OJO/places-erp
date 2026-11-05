import { existsSync } from "node:fs";
import { z } from "zod";

// locally the settings come from the repo-root .env (scripts run from apps/worker); in production from the environment
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

/** The worker refuses to start with a missing or malformed setting, like the API. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
});
export const env = Env.parse(process.env);
