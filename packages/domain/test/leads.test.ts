import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadRouter, distributeEvenly, isQualifiedAfter, leadSla, mergeDuplicate, placeNewLead, slaView, canSeeLeadLogs } from "../src/leads.ts";

const cairo = (iso: string) => new Date(`${iso}+03:00`);
const fresh = (assignedAt: Date) => ({ stage: "Fresh" as const, touched: false, ownedByTelesales: false, assignedAt });

test("SLA: Team Leader warned after 2h30 of working time, lead pulled after 3h", () => {
  const at = cairo("2026-10-25T11:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T13:29:00"))?.level, "ok");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T13:30:00"))?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T14:00:00"))?.level, "pull");
});

test("SLA: a lead that arrives after hours starts counting next working morning", () => {
  const at = cairo("2026-10-25T21:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-26T13:59:00"))?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-26T14:00:00"))?.level, "pull");
});

test("SLA: on holidays it is wall-clock — warn after 22h, pull after 24h", () => {
  const at = cairo("2026-10-23T10:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-24T08:00:00"), { holidayMode: true })?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-24T10:00:00"), { holidayMode: true })?.level, "pull");
});

test("SLA does not apply once the lead was touched or isn't Fresh", () => {
  const at = cairo("2026-10-25T11:00:00");
  assert.equal(leadSla({ ...fresh(at), touched: true }, cairo("2026-10-25T18:00:00")), null);
  assert.equal(leadSla({ ...fresh(at), stage: "Interested" }, cairo("2026-10-25T18:00:00")), null);
});

test("Qualified is sticky and Cancellation/Hold only count if already Interested", () => {
  assert.equal(isQualifiedAfter(false, "Interested"), true);
  assert.equal(isQualifiedAfter(true, "No Answer"), true);
  assert.equal(isQualifiedAfter(false, "Cancellation"), false);
  assert.equal(isQualifiedAfter(true, "Hold"), true);
});

test("routing is round-robin per area and a hand assignment uses up a turn", () => {
  const r = new LeadRouter();
  const pool = ["a", "b", "c"];
  assert.deepEqual([r.next("Zayed", pool), r.next("Zayed", pool), r.next("Zayed", pool), r.next("Zayed", pool)], ["a", "b", "c", "a"]);
  r.assignedByHand("b");
  assert.deepEqual([r.next("Zayed", pool), r.next("Zayed", pool)], ["c", "a"]); // b's turn skipped once
  assert.equal(r.next("Maadi", []), null);
});

test("bulk upload: 50 numbers over 17 salespeople → 16 get 3, one gets 2", () => {
  const people = Array.from({ length: 17 }, (_, i) => `s${i}`);
  const counts = [...distributeEvenly(50, people).values()];
  assert.equal(counts.filter((c) => c === 3).length, 16);
  assert.equal(counts.filter((c) => c === 2).length, 1);
});

test("new lead placement: Telesales keeps it («يفضل عندي») or sends it to routing; a salesperson keeps his own (Q3); Operations by hand (Q2)", () => {
  const tele = { employeeId: "hadeer", isTelesales: true, ownScope: true };
  const sales = { employeeId: "mohsen", isTelesales: false, ownScope: true };
  const ops = { employeeId: "heba", isTelesales: false, ownScope: false };
  assert.deepEqual(placeNewLead(tele, { keep: true }), { kind: "telesales", to: "hadeer" });
  assert.deepEqual(placeNewLead(tele, { keep: false }), { kind: "route" });
  assert.deepEqual(placeNewLead(tele, {}), { kind: "route" }); // the form's first choice is «التوزيع»
  assert.deepEqual(placeNewLead(sales, {}), { kind: "own", to: "mohsen" });
  assert.deepEqual(placeNewLead(sales, { keep: true }), { kind: "own", to: "mohsen" }); // keep is Telesales' choice only
  assert.deepEqual(placeNewLead(ops, {}), { kind: "route" });
  assert.deepEqual(placeNewLead(ops, { assignToId: "mohsen" }), { kind: "hand", to: "mohsen" });
  assert.deepEqual(placeNewLead({ employeeId: null, isTelesales: true, ownScope: true }, { keep: true }), { kind: "route" }); // no HR file: can't hold a lead
});

test("SLA doesn't run while the lead is with Telesales", () => {
  assert.equal(leadSla({ stage: "Fresh", touched: false, ownedByTelesales: true, assignedAt: new Date("2026-11-03T09:00:00Z") }, new Date("2026-11-03T15:00:00Z")), null);
});

test("duplicate (M-01 Q7): Operations keeps the old data unless «new» is picked; both mobiles are kept once; the channel moves with its campaign", () => {
  const old = { name: "أ. هبة رضا", area: "التجمع الخامس", type: "Rent", space: 100, budget: "120000.00", channel: "Google Ads", campaignId: "c5", phones: ["01033221100"] };
  const neu = { name: "هبة رضا محمد", area: "التجمع الخامس", type: "Resale", space: 150, budget: null, channel: "Facebook", campaignId: "c1", phones: ["01033221100", "01155554444"] };

  const keepAll = mergeDuplicate(old, neu, {});
  assert.deepEqual(keepAll.changes, { phones: ["01033221100", "01155554444"] }); // nothing chosen: only the new mobile joins
  assert.deepEqual(keepAll.took, []);

  const r = mergeDuplicate(old, neu, { name: "new", space: "new", area: "new", channel: "new", type: "old" });
  assert.deepEqual(r.changes, { name: "هبة رضا محمد", space: 150, channel: "Facebook", campaignId: "c1", phones: ["01033221100", "01155554444"] });
  assert.deepEqual(r.took, ["الاسم", "Space", "الـ channel"]); // «area» was picked but is the same: nothing to take

  const same = mergeDuplicate(old, { ...old }, { name: "new", channel: "new" });
  assert.deepEqual(same, { changes: {}, took: [] });
  assert.deepEqual(mergeDuplicate(old, neu, { budget: "new" }).changes.budget, null); // «new» can also clear a value
});

test("SLA view for the list and the Kanban: 1h30 of a 3h clock is 50%, pulled is 100%, custom rules from settings (M-13)", () => {
  const at = cairo("2026-10-25T11:00:00");
  assert.deepEqual(slaView(fresh(at), cairo("2026-10-25T12:30:00")), { level: "ok", elapsed: 90, minutesLeft: 90, pct: 50 });
  assert.equal(slaView(fresh(at), cairo("2026-10-25T15:00:00"))?.pct, 100);
  const rules = { warnAfter: 60, pullAfter: 120, holidayWarnAfter: 600, holidayPullAfter: 720 };
  assert.deepEqual(slaView(fresh(at), cairo("2026-10-25T12:00:00"), { holidayMode: false, rules }), { level: "warn", elapsed: 60, minutesLeft: 60, pct: 50 });
  assert.equal(slaView({ ...fresh(at), touched: true }, cairo("2026-10-25T12:00:00")), null);
});

test("Logs tab (1.25): the admin always; other roles only when the admin picked them", () => {
  assert.equal(canSeeLeadLogs(["admin"], []), true);
  assert.equal(canSeeLeadLogs(["ops"], []), false);
  assert.equal(canSeeLeadLogs(["ops"], ["ops", "salesdir"]), true);
  assert.equal(canSeeLeadLogs(["tl", "sales"], ["ops"]), false);
  assert.equal(canSeeLeadLogs(["tl", "sales"], ["sales"]), true); // any of the person's roles
});

test("areas × salespeople (1.12): ticking adds to the end of the area's rotation, unticking removes; never twice", async () => {
  const { setAreaMember, LeadRouter: Router } = await import("../src/leads.ts");
  let r = setAreaMember({}, "التجمع الخامس", "s1", true);
  r = setAreaMember(r, "التجمع الخامس", "s2", true);
  r = setAreaMember(r, "التجمع الخامس", "s1", true); // ticked twice: still once, keeps its place at the end
  assert.deepEqual(r["التجمع الخامس"], ["s2", "s1"]);
  r = setAreaMember(r, "الشيخ زايد", "s3", true);
  r = setAreaMember(r, "التجمع الخامس", "s2", false);
  assert.deepEqual(r, { "التجمع الخامس": ["s1"], "الشيخ زايد": ["s3"] });
  assert.deepEqual(setAreaMember(r, "أكتوبر", "s9", false), { ...r, "أكتوبر": [] }); // unticking someone who isn't there
  // the next lead in an area goes to the next person in that area's list (Q1)
  const router = new Router();
  const pool = ["s1", "s2", "s3"];
  assert.deepEqual([router.next("x", pool), router.next("x", pool), router.next("x", pool), router.next("x", pool)], ["s1", "s2", "s3", "s1"]);
});

test("Visit / Meeting moves the stage forward only (1.9, 4 Nov demo meeting)", async () => {
  const { visitStage } = await import("../src/leads.ts");
  // the card's example: Interested + Visit → Follow up to Visit → Done → Visit
  assert.equal(visitStage("Interested", "Visit", "booked"), "Follow up to Visit");
  assert.equal(visitStage("Follow up to Visit", "Visit", "done"), "Visit");
  assert.equal(visitStage("Follow up after Visit", "Meeting", "booked"), "Follow up to Meeting");
  assert.equal(visitStage("Follow up to Meeting", "Meeting", "done"), "Meeting");
  // Near to Close + Visit doesn't go back
  assert.equal(visitStage("Near to Close", "Visit", "booked"), null);
  assert.equal(visitStage("Near to Close", "Visit", "done"), null);
  assert.equal(visitStage("Meeting", "Visit", "done"), null);
  assert.equal(visitStage("Visit", "Visit", "done"), null);
  // a side stage joins the pipeline
  assert.equal(visitStage("No Answer", "Visit", "booked"), "Follow up to Visit");
  // the new stage counts as Qualified
  assert.equal(isQualifiedAfter(false, "Follow up to Meeting"), true);
});
