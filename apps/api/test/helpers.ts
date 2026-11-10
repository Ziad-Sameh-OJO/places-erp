/**
 * Shared by the e2e tests: HTTP calls with a cookie, sign-in, the dev outbox (emails the API "sent"), and the cleanup
 * of what a test file's actions left around it (sessions, notifications, mails, audit lines).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { after } from "node:test";
import { prisma } from "@places/db";
import type { LeadRules } from "@places/domain";
import { workingDay } from "../../worker/src/calendar.ts";

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
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (cookie) tokens.add(cookie.slice(cookie.indexOf("=") + 1));
  // whatever a POST created is this file's: the notifications, mails and audit lines that point at it go with it
  if ((init.method ?? "GET") === "POST" && res.status === 201) {
    const made = body as { id?: unknown; code?: unknown } | null;
    if (typeof made?.id === "string") mark(made.id);
    if (typeof made?.code === "string") mark(`${made.code} `); // «D-301 اتحصّلت بالكامل»: a code is unique, the space ends it
  }
  return { status: res.status, body, cookie };
}

/*
 * e2e runs against whatever database .env points at — often the developer's own. Each test file deletes the rows it
 * made in its own `after`; the side effects of its API calls are cleaned here, for every file, by what is provably
 * the file's own: the session tokens it got, the ids its POSTs created, and the markers it passes to `mark()` (its
 * stamp, the codes it made). Only rows written since the file started, never a broad delete: other files run at the
 * same time against the same database.
 */
const STARTED = new Date(Date.now() - 2_000); // the API's clock may be a moment behind ours (see CLOCK_SKEW_MS)
const tokens = new Set<string>();
const marks = new Set<string>();
/** Notifications / mails / audit lines whose text, link or entity carries one of these are this file's. */
export function mark(...markers: (string | null | undefined)[]) {
  for (const m of markers) if (m && m.length >= 6) marks.add(m); // never a short, common word
}
/**
 * A leave's notices name no id: «طلب إجازتك…» goes to the person, «طلب إجازة … من <name>» to the TL and HR. Two files
 * ask leaves at the same time (leaves, visit-day), so only the ones about this employee.
 */
export async function cleanLeaveNotices(employeeId: string, since: Date) {
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { userId: true, name: true } });
  await prisma.notification.deleteMany({ where: {
    createdAt: { gte: since }, event: { in: ["hr.leave_request", "hr.leave_decided"] },
    OR: [{ userId: e.userId ?? "" }, { text: { contains: e.name } }],
  } });
}

/**
 * A unit saved with an owner's name and mobile opens the owner's client file (M-10 2.1 step 4). Call after deleting
 * the units: only files this run opened (since `since`) that nothing else uses — an owner who was already there stays.
 */
export async function removeOwners(clientIds: string[], since: Date) {
  const gone = { id: { in: clientIds }, createdAt: { gte: since }, units: { none: {} }, leads: { none: {} } };
  const ids = (await prisma.client.findMany({ where: gone, select: { id: true } })).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
}

/*
 * node:test skips every later after() once one throws — a single failed delete used to leave the rest of a file's
 * rows behind (the «E2E-S / E2E-D / E2E-K» leads on the home page). `cleanup()` runs them all, then reports.
 */
const failures: unknown[] = [];
let cleanups = 0, ran = 0;
/** `after()` for a clean-up that must not stop the file's other clean-ups when it fails. */
export function cleanup(fn: () => unknown) {
  cleanups++;
  after(async () => {
    try { await fn(); } catch (e) { failures.push(e); }
    if (++ran === cleanups && failures.length) throw new AggregateError(failures, "e2e clean-up failed");
  });
}

// registered when the file imports this module, so it runs before the file's own after(): it never throws
after(async () => {
  try {
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    if (tokens.size) await prisma.session.deleteMany({ where: { id: { in: [...tokens].map(sha) } } });
    if (!marks.size) return;
    const m = [...marks];
    const since = { gte: STARTED };
    const notices = { createdAt: since, OR: m.flatMap((x) => [{ text: { contains: x } }, { link: { contains: x } }]) };
    await prisma.mailLog.deleteMany({ where: { createdAt: since, OR: [{ notification: notices }, ...m.flatMap((x) => [{ text: { contains: x } }, { subject: { contains: x } }, { to: { contains: x } }])] } });
    await prisma.notification.deleteMany({ where: notices });
    await prisma.auditLog.deleteMany({ where: { at: since, entityId: { in: m } } });
  } catch (e) {
    if (cleanups) failures.push(e); // reported by the file's last cleanup()
    else { console.error("e2e clean-up failed", e); process.exitCode = 1; }
  }
});

export const login = (email: string, password = PW) => call("/auth/login", { method: "POST", body: { email, password } });
export async function session(email: string, password = PW) {
  const r = await login(email, password);
  if (r.status !== 200 || !r.cookie) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.cookie;
}

/**
 * The API names each mail with its own clock, the test passes its own `since`: two processes whose `Date.now()`
 * can be a few ms apart on Windows (more with several test files running at once). A mail sent right after
 * `since` was then dated just before it and «not found» — the forgot-password / OTP flake. So allow a margin.
 */
const CLOCK_SKEW_MS = 2_000;

/** The newest email to `to` written after `since` (ms), give or take the two clocks' skew. */
export function lastMail(to: string, since: number): { subject: string; text: string } {
  const f = readdirSync(OUTBOX).filter((n) => n.endsWith(`-${to}.json`) && Number(n.split("-")[0]) >= since - CLOCK_SKEW_MS).sort().at(-1);
  if (!f) throw new Error(`no mail to ${to}`);
  return JSON.parse(readFileSync(`${OUTBOX}/${f}`, "utf8"));
}
export const tokenIn = (text: string) => text.match(/token=([\w-]+)/)![1]!;

/**
 * Now, or the same time on the next working day when today is a day off (Friday, a holiday, a configured day off):
 * the daily jobs rest on days off, so a test that runs «today's» job runs it on a day it works.
 */
export async function workingNow(rules?: LeadRules): Promise<Date> {
  for (let t = Date.now(); ; t += 86_400_000) if (await workingDay(new Date(t), rules)) return new Date(t);
}

const KPI_QUARTER_LOCK = 2026_04;
/**
 * The test files run in parallel on one database, and kpis.e2e closes Q4 2026 and starts Q1 2027 (then puts it back),
 * while the KPI job and the KPI clocks read «the current quarter». Waiting for Q4 to look open is check-then-act and
 * lost the race on CI; this holds a Postgres advisory lock for `fn`, so a test that switches the quarter and a test
 * that needs Q4 open never overlap. The lock lives in a transaction that `fn` itself doesn't use.
 */
export function kpiQuarterLock<T>(fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${KPI_QUARTER_LOCK}::bigint)`;
    return fn();
  }, { maxWait: 60_000, timeout: 600_000 });
}
