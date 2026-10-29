/** Shared by the e2e tests: HTTP calls with a cookie, sign-in, and the dev outbox (emails the API "sent"). */
import { readdirSync, readFileSync } from "node:fs";

export const API = (process.env.API_URL ?? "http://localhost:4000") + "/api/v1";
export const PW = process.env.SEED_DEV_PASSWORD!;
const OUTBOX = "../../.local/outbox";

export async function call(path: string, init: { method?: string; body?: unknown; cookie?: string | undefined } = {}) {
  const res = await fetch(API + path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

export const login = (email: string, password = PW) => call("/auth/login", { method: "POST", body: { email, password } });
export async function session(email: string, password = PW) {
  const r = await login(email, password);
  if (r.status !== 200 || !r.cookie) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.cookie;
}

/** The newest email to `to` written after `since` (ms). */
export function lastMail(to: string, since: number): { subject: string; text: string } {
  const f = readdirSync(OUTBOX).filter((n) => n.endsWith(`-${to}.json`) && Number(n.split("-")[0]) >= since).sort().at(-1);
  if (!f) throw new Error(`no mail to ${to}`);
  return JSON.parse(readFileSync(`${OUTBOX}/${f}`, "utf8"));
}
export const tokenIn = (text: string) => text.match(/token=([\w-]+)/)![1]!;
