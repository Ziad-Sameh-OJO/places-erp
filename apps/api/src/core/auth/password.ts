import { hash, verify } from "@node-rs/argon2";

/** argon2id with OWASP-recommended parameters. Passwords are never logged, stored or returned in clear. */
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (plain: string) => hash(plain, OPTS);
export const verifyPassword = (stored: string, plain: string) => verify(stored, plain);

/** M-09: at least 10 characters with letters and digits. */
export const isStrongEnough = (p: string) => p.length >= 10 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);
