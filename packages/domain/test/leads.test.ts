import { test } from "node:test";
import { PLACES_CALENDAR } from "../src/business-time.ts";
import assert from "node:assert/strict";
import { CANCEL_REASONS, LeadRouter, distributeEvenly, isQualifiedAfter, leadSla, mergeDuplicate, needsCancelReason, placeNewLead, slaView, canSeeLeadLogs, tlNoteUnseen, writesTlNote } from "../src/leads.ts";

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

test("SLA: on a holiday the clock starts with the holiday, not at the last working evening's assignment", () => {
  // Thursday 18:30 (30 working minutes used), Friday off, Saturday an official holiday (M-01 Q4)
  const winter = (iso: string) => new Date(`${iso}+02:00`); // Cairo is UTC+2 after daylight saving ends
  const calendar = { ...PLACES_CALENDAR, holidays: new Set(["2026-11-28"]) };
  const at = winter("2026-11-26T18:30:00");
  assert.equal(leadSla(fresh(at), winter("2026-11-28T00:30:00"), { holidayMode: true, calendar })?.level, "ok");
  assert.equal(leadSla(fresh(at), winter("2026-11-28T00:30:00"), { holidayMode: true, calendar })?.elapsed, 30);
  assert.equal(leadSla(fresh(at), winter("2026-11-28T22:00:00"), { holidayMode: true, calendar })?.level, "warn");
  // a lead that arrived on the holiday itself counts from its own arrival
  assert.equal(leadSla(fresh(winter("2026-11-28T10:00:00")), winter("2026-11-28T22:00:00"), { holidayMode: true, calendar })?.elapsed, 720);
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

test("Visit / Meeting moves the stage forward only (1.9 · 14.5: no «Follow up to …» stages)", async () => {
  const { visitStage } = await import("../src/leads.ts");
  // Interested + Visit booked → Visit; a Meeting after it → Meeting
  assert.equal(visitStage("Interested", "Visit"), "Visit");
  assert.equal(visitStage("Visit", "Meeting"), "Meeting");
  assert.equal(visitStage("Fresh", "Meeting"), "Meeting");
  // Near to Close + Visit doesn't go back; already there: no move
  assert.equal(visitStage("Near to Close", "Visit"), null);
  assert.equal(visitStage("Meeting", "Visit"), null);
  assert.equal(visitStage("Visit", "Visit"), null);
  // a side stage joins the pipeline
  assert.equal(visitStage("No Answer", "Visit"), "Visit");
  assert.equal(isQualifiedAfter(false, "Meeting"), true);
});

test("14.5: the client's stages, no «Follow up …»; the tabs in order, Interested opens Visit and Meeting", async () => {
  const { LEAD_STAGES, LEAD_PIPELINE, STAGE_TABS, PROPERTY_TYPES } = await import("../src/index.ts");
  assert.deepEqual([...LEAD_STAGES], ["Fresh", "No Answer", "Interested", "Not Interested", "Visit", "Meeting", "Near to Close", "Done Deal", "Cancellation", "Hold"]);
  assert.ok(!LEAD_STAGES.some((s) => s.startsWith("Follow up")));
  assert.deepEqual([...LEAD_PIPELINE], ["Fresh", "Interested", "Visit", "Meeting", "Near to Close", "Done Deal"]);
  assert.deepEqual(STAGE_TABS.map((t) => t.stage), ["Fresh", "No Answer", "Interested", "Not Interested", "Near to Close", "Done Deal", "Cancellation"]);
  assert.deepEqual(STAGE_TABS.find((t) => t.stage === "Interested")?.sub, ["Visit", "Meeting"]);
  assert.ok(!STAGE_TABS.some((t) => (t.stage as string) === "Qualified"));
  assert.deepEqual([...PROPERTY_TYPES], ["Commercial", "Residential", "Admin office"]);
});

test("1.33: the Team Leader, Sales Director and admin write the note; the salesperson sees it until they open the lead", () => {
  assert.ok(writesTlNote(["tl"]) && writesTlNote(["salesdir"]) && writesTlNote(["sales", "admin"]));
  assert.ok(!writesTlNote(["sales"]) && !writesTlNote(["ops"]) && !writesTlNote(["telesales"]));
  const at = new Date("2026-11-10T09:00:00Z");
  assert.equal(tlNoteUnseen({ tlNote: "كلّمه عن الدور التالت", tlNoteAt: at, tlNoteSeenAt: null }), true);
  assert.equal(tlNoteUnseen({ tlNote: "كلّمه عن الدور التالت", tlNoteAt: at, tlNoteSeenAt: new Date("2026-11-10T09:05:00Z") }), false);
  // a new note after it was seen shows again
  assert.equal(tlNoteUnseen({ tlNote: "جديدة", tlNoteAt: new Date("2026-11-10T10:00:00Z"), tlNoteSeenAt: new Date("2026-11-10T09:05:00Z") }), true);
  assert.equal(tlNoteUnseen({ tlNote: null, tlNoteAt: null, tlNoteSeenAt: null }), false);
});

test("«غيّر المرحلة» (client, 11 Nov): only the chosen buttons, Hold and Cancellation under the rest", async () => {
  const { STAGE_PICKER, LEAD_STAGES } = await import("../src/index.ts");
  assert.deepEqual(STAGE_PICKER.main, ["Fresh", "Interested", "Visit", "No Answer", "Meeting", "Done Deal", "Near to Close"]);
  assert.deepEqual(STAGE_PICKER.side, ["Hold", "Cancellation"]);
  for (const s of [...STAGE_PICKER.main, ...STAGE_PICKER.side]) assert.ok((LEAD_STAGES as readonly string[]).includes(s), s);
});

test("the Kanban: the picked stages in order; a dropped stage's lane only while leads are in it", async () => {
  const { boardLanes, isPickableStage } = await import("../src/index.ts");
  const lane = (stage: string, total: number) => ({ stage, total });
  const api = [lane("Fresh", 2), lane("Interested", 0), lane("Not Interested", 3), lane("Visit", 1), lane("No Answer", 0), lane("Meeting", 0), lane("Near to Close", 0), lane("Done Deal", 0), lane("Cancellation", 0), lane("Hold", 0)];
  assert.deepEqual(boardLanes(api).map((l) => l.stage), ["Fresh", "Interested", "Visit", "No Answer", "Meeting", "Done Deal", "Near to Close", "Hold", "Cancellation", "Not Interested"]);
  assert.equal(isPickableStage("Not Interested"), false);
  assert.equal(isPickableStage("Hold"), true);
});

test("Cancellation needs a reason from the client's list (22 Nov); no other stage does", () => {
  assert.deepEqual([...CANCEL_REASONS], ["Not Interested", "Low Budget", "Destination", "No Answer", "Rent Outside", "Buy Outside"]);
  assert.equal(needsCancelReason("Cancellation"), true);
  for (const s of ["Fresh", "Not Interested", "No Answer", "Hold", "Done Deal"]) assert.equal(needsCancelReason(s), false, s);
});
