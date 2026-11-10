/**
 * 9.19 · the accountant's whole «مستنيك النهارده» (demo finance.js financeInbox + claims.js claimsInbox) is built on the
 * home page and the finance dashboard from these endpoints: the accountant reads every one, a salesperson none.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const SOURCES = ["/home/collect", "/claims?status=open", "/finance/commissions", "/procurement/purchases/settled", "/finance/payroll", "/finance/bills", "/finance/budget"];
let ashraf: string, mohsen: string;

before(async () => {
  [ashraf, mohsen] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com"].map((e) => session(e)));
});
after(async () => { await prisma.$disconnect(); });

test("9.19: the accountant reads every source of «مستنيك النهارده»; sales gets 403 on each (the claims list is only his own)", async () => {
  for (const path of SOURCES) {
    const r = await call(path, { cookie: ashraf });
    assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`);
    // /claims is @SignedIn: a salesperson sees the claims he asked for (9.17), not finance's queue
    if (path.startsWith("/claims")) continue;
    assert.equal((await call(path, { cookie: mohsen })).status, 403, path);
  }
});
