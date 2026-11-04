/**
 * 9.7 · the income statement (M-07, the accountant's meeting 4 Nov): «الشهر ده» and «من أول السنة» from the chart, in
 * the stages revenue → commissions → selling → admin → other → net; a receipt and a payment this month show on their
 * own lines. Only finance reads it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { cents, cleanFinance, fresh } from "./finance-helpers.ts";

const START = new Date();
const P = `E2E ${START.getTime()}`;
let ahmed: string, sales: string;
let safe: { id: string }, rev: { id: string; code: string }, exp: { id: string; code: string };

before(async () => {
  [ahmed, sales] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  safe = await fresh(ahmed, P, "111", "خزينة", "10000");
  rev = await fresh(ahmed, P, "42", "استشارات");
  exp = await fresh(ahmed, P, "52", "صيانة");
  for (const body of [{ kind: "receive", toId: safe.id, accountId: rev.id, amount: "5000", party: P }, { kind: "pay", fromId: safe.id, accountId: exp.id, amount: "1200", party: P }]) {
    const r = await call("/finance/moves", { method: "POST", cookie: ahmed, body: { ...body, memo: `${P} حركة` } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
});
after(async () => { await cleanFinance(P, START); await prisma.$disconnect(); });

test("only finance reads the statements", async () => {
  assert.equal((await call("/finance/statements/income", { cookie: sales })).status, 403);
});

test("this month: the receipt on its revenue line, the payment on admin; the stages add up to net (9.7)", async () => {
  for (const range of ["month", "year"]) {
    const s = (await call(`/finance/statements/income?range=${range}`, { cookie: ahmed })).body;
    assert.equal(s.range, range);
    assert.equal(s.lines.revenue.find((l: { code: string }) => l.code === rev.code).value, "5000.00");
    assert.equal(s.lines.admin.find((l: { code: string }) => l.code === exp.code).value, "1200.00");
    assert.equal(cents(s.gross), cents(s.revenue) - cents(s.direct));
    assert.equal(cents(s.contribution), cents(s.gross) - cents(s.selling));
    assert.equal(cents(s.net), cents(s.contribution) - cents(s.admin) - cents(s.other));
    assert.equal(cents(s.revenue), s.lines.revenue.reduce((t: number, l: { value: string }) => t + cents(l.value), 0));
  }
  assert.equal((await call("/finance/statements/income?range=week", { cookie: ahmed })).status, 400);
});
