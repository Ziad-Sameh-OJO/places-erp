/** The browser tour's one helper: headless Chromium against the running web app, signed in as a seeded person by the demo's ref (u6, s1…). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

export const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const people: { ref: string; email: string }[] = JSON.parse(readFileSync(new URL("../../../packages/db/prisma/seed-data/people.json", import.meta.url), "utf8"));

let browser: Browser | undefined;
export const close = () => browser?.close();

/** A fresh page signed in as `ref`, at `width` px. Console errors and failed pages are collected for `done`. */
export async function as(ref: string, width: number) {
  browser ??= await chromium.launch();
  const email = people.find((p) => p.ref === ref)?.email;
  assert.ok(email, `no seeded person ${ref}`);
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  const r = await page.request.post(`${WEB}/api/v1/auth/login`, { data: { email, password: process.env.SEED_DEV_PASSWORD } });
  assert.equal(r.status(), 200, `login ${ref}`);
  return { page, errors };
}

/** The step's screen is fine: nothing wider than the screen, no console errors. Then the context is closed. */
export async function done({ page, errors }: { page: Page; errors: string[] }) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.context().close();
  assert.ok(over <= 1, `horizontal overflow ${over}px`);
  assert.deepEqual(errors, []);
}
