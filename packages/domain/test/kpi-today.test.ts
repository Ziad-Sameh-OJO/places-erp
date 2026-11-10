/** 11.16 · the KPI lines of «مهامي النهارده» (demo kpis.js kpiInbox): approve as the follower, type manual numbers, hand in. */
import { test } from "node:test";
import assert from "node:assert/strict";

// Abdallah Sleem (TL) follows Mohamed Mohsen's card; Heba (ops) types its «Second Call» number by role (meeting 4 Nov)
const mohsen = {
  id: "c1", employeeId: "e-mohsen", followerId: "e-abdallah", approved: false,
  items: [
    { title: "Deals", method: "system" as const, enteredBy: [], report: null, required: null, delivered: 0 },
    { title: "التقييم", method: "manual" as const, enteredBy: ["follower"], report: null, required: null, delivered: 0 },
    { title: "Second Call", method: "manual" as const, enteredBy: ["ops"], report: null, required: null, delivered: 0 },
    { title: "Market report", method: "report" as const, enteredBy: [], report: null, required: 4, delivered: 1 },
    { title: "التقرير اليومي", method: "report" as const, enteredBy: [], report: "daily", required: 60, delivered: 3 },
  ],
};

test("the follower: «KPIs <name>» waiting for approval, with its 2 manual items; gone once approved", async () => {
  const { kpiTodayLines } = await import("../src/index.ts");
  const tl = { userId: "u-abdallah", employeeId: "e-abdallah", roles: ["tl", "sales"] };
  assert.deepEqual(kpiTodayLines([mohsen], tl), [{ kind: "approve", cardId: "c1", manual: 2 }]);
  assert.deepEqual(kpiTodayLines([{ ...mohsen, approved: true }], tl), []);
});

test("not the follower: «دخّل أرقام KPIs» only for the items naming me or my role", async () => {
  const { kpiTodayLines } = await import("../src/index.ts");
  assert.deepEqual(kpiTodayLines([mohsen], { userId: "u-heba", employeeId: "e-heba", roles: ["ops"] }), [{ kind: "enter", cardId: "c1", manual: 1 }]);
  assert.deepEqual(kpiTodayLines([mohsen], { userId: "u-basant", employeeId: "e-basant", roles: ["hr"] }), []);
});

test("my own card: «تسليم» for a hand-in still owed, not for one a report counts; «الملاك» = an admin on a card with no follower", async () => {
  const { kpiTodayLines } = await import("../src/index.ts");
  const me = { userId: "u-mohsen", employeeId: "e-mohsen", roles: ["sales"] };
  assert.deepEqual(kpiTodayLines([mohsen], me), [{ kind: "deliver", cardId: "c1", item: "Market report", delivered: 1, required: 4 }]);
  const done = { ...mohsen, items: mohsen.items.map((it) => (it.title === "Market report" ? { ...it, delivered: 4 } : it)) };
  assert.deepEqual(kpiTodayLines([done], me), []);
  const owners = { ...mohsen, followerId: null };
  assert.deepEqual(kpiTodayLines([owners], { userId: "u-admin", employeeId: "e-admin", roles: ["admin"] }), [{ kind: "approve", cardId: "c1", manual: 2 }]);
});
