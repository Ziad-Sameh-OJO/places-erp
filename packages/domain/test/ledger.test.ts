import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { balanceOf, entryProblem, entryTotals, natureOf, nextChildCode, openingLines, rollUp } from "../src/ledger.ts";

// The numbers are the accountant's meeting example (M-07, 4 Nov): a 1,000 EGP buffet voucher from the main treasury,
// and the accountant's chart of accounts (docs/requirements/sources/chart-of-accounts.md).

test("a voucher's entry balances: buffet 1,000 from the main treasury — debit 5203, credit 11101 (M-07 9.5)", () => {
  const lines = [{ accountId: "5203", debit: egp(1_000), credit: 0 }, { accountId: "11101", debit: 0, credit: egp(1_000) }];
  assert.equal(entryProblem(lines), null);
  assert.deepEqual(entryTotals(lines), { debit: egp(1_000), credit: egp(1_000) });
});

test("an entry is refused when it doesn't balance, has one line, or a line is both / neither (M-07 9.5 · 9.13)", () => {
  assert.match(entryProblem([{ accountId: "a", debit: egp(500), credit: 0 }, { accountId: "b", debit: 0, credit: egp(400) }])!, /مش متوازن/);
  assert.match(entryProblem([{ accountId: "a", debit: egp(500), credit: 0 }])!, /سطرين/);
  assert.match(entryProblem([{ accountId: "a", debit: egp(5), credit: egp(5) }, { accountId: "b", debit: 0, credit: 0 }])!, /يا مدين يا دائن/);
  assert.match(entryProblem([{ accountId: "a", debit: -egp(5), credit: 0 }, { accountId: "b", debit: 0, credit: -egp(5) }])!, /موجبة/);
});

test("nature follows the root: assets and expenses debit, liabilities, equity and revenue credit", () => {
  assert.equal(natureOf("11101"), "dr");
  assert.equal(natureOf("5203"), "dr");
  assert.equal(natureOf("231"), "cr");
  assert.equal(natureOf("34"), "cr");
  assert.equal(natureOf("4101"), "cr");
  assert.equal(balanceOf("dr", egp(412_000), egp(1_000)), egp(411_000));
  assert.equal(balanceOf("cr", 0, egp(86_000)), egp(86_000));
});

test("a new sub-account's code follows its parent: a loan under 22 after 221 / 222 is 2201, then 2202 (M-07, 4 Nov)", () => {
  assert.equal(nextChildCode("22", ["221", "222"]), "2201");
  assert.equal(nextChildCode("22", ["221", "222", "2201"]), "2202");
  assert.equal(nextChildCode("5317", ["531701", "531702", "531703"]), "531704");
  assert.equal(nextChildCode("13201", []), "1320101");
  assert.equal(nextChildCode("113", ["11301", "113001", "113002"], 3), "113003"); // 9.12: clients take three digits
});

test("a parent's balance is the sum of its children's; a contra account counts against it (fixed assets 420,000 net)", () => {
  const accounts = [
    { id: "12", parentId: null, nature: "dr" as const },
    { id: "121", parentId: "12", nature: "dr" as const }, // furniture
    { id: "123", parentId: "12", nature: "dr" as const }, // laptops
    { id: "126", parentId: "12", nature: "cr" as const }, // accumulated depreciation
  ];
  const own = new Map([["121", { debit: egp(180_000), credit: 0 }], ["123", { debit: egp(290_000), credit: 0 }], ["126", { debit: 0, credit: egp(50_000) }]]);
  const b = rollUp(accounts, own);
  assert.equal(b.get("126"), egp(50_000));
  assert.equal(b.get("12"), egp(420_000));
});

test("opening balances close against retained earnings so the entry balances (M-07 9.5)", () => {
  const lines = openingLines([
    { accountId: "11101", nature: "dr", amount: egp(412_000) }, // main treasury
    { accountId: "11201", nature: "dr", amount: egp(2_860_000) }, // CIB
    { accountId: "231", nature: "cr", amount: egp(86_000) }, // VAT
    { accountId: "31", nature: "cr", amount: egp(1_500_000) }, // capital
  ], "33");
  assert.equal(entryProblem(lines), null);
  const re = lines.find((l) => l.accountId === "33")!;
  assert.deepEqual(re, { accountId: "33", debit: 0, credit: egp(1_686_000) });
});

test("periods: the open month follows today, the month before closes by itself, a hand close holds (9.8, 4 Nov)", async () => {
  const { periodStatus, closedProblem, monthLabel } = await import("../src/index.ts");
  const none = new Map();
  assert.equal(periodStatus("2026-11", "2026-11-04", none), "open");
  assert.equal(periodStatus("2026-10", "2026-11-04", none), "month");
  assert.equal(periodStatus("2026-11", "2026-11-30", new Map([["2026-11", "quarter" as const]])), "quarter");
  assert.equal(closedProblem("2026-11-02", "2026-11-04", none), null);
  assert.equal(closedProblem("2026-10-31", "2026-11-04", none), "شهر أكتوبر 2026 مقفول · مينفعش تسجّل حركة فيه");
  assert.equal(monthLabel("2026-12"), "ديسمبر 2026");
});

test("income statement stages: revenue − commissions − selling − admin − other = net = account 34 (9.7)", async () => {
  const { incomeStatement } = await import("../src/index.ts");
  const leaves = [
    { code: "4101", name: "عمولات تسويق عقاري اداري", value: 500_000_00 }, { code: "4204", name: "ايرادات استشارات عقارية", value: 20_000_00 },
    { code: "5302", name: "عمولة مبيعات", value: 75_000_00 }, { code: "5305", name: "عمولة تيم ليدر", value: 10_000_00 },
    { code: "5307", name: "سبونسر فيسوك", value: 30_000_00 }, { code: "5201", name: "ايجار", value: 60_000_00 }, { code: "5203", name: "بوفيه", value: 5_000_00 },
    { code: "55", name: "اهلاك الاصول الثابتة", value: 12_000_00 },
  ];
  const s = incomeStatement(leaves, [{ code: "54", name: "مصروفات اخري" }, { code: "55", name: "اهلاك الاصول الثابتة" }]);
  assert.equal(s.revenue, 520_000_00);
  assert.equal(s.gross, 435_000_00); // − 85,000 commissions
  assert.equal(s.contribution, 405_000_00); // − 30,000 selling
  assert.equal(s.admin, 65_000_00);
  assert.equal(s.other, 12_000_00);
  assert.equal(s.net, 328_000_00);
  assert.equal(s.net, 520_000_00 - leaves.filter((l) => l.code.startsWith("5")).reduce((t, l) => t + l.value, 0)); // = 4 − 5 = account 34
});
