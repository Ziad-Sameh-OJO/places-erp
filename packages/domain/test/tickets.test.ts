import { test } from "node:test";
import assert from "node:assert/strict";
import { closedInSla, handlesTicket, isTicketLate, seesTicket, slaReport, statusAfterReply, ticketDepartment, ticketType, type TicketAudience, type TicketClock, type TicketViewer } from "../src/tickets.ts";

// November 2026, Cairo = UTC+2: 11:00 Cairo = 09:00Z. 8 Nov is a Sunday, 13 Nov a Friday (off).
const at = (iso: string) => new Date(iso);
const ticket = (t: Partial<TicketClock> & { createdAt: Date }): TicketClock => ({ type: "request", priority: "normal", status: "Open", firstReplyAt: null, resolvedAt: null, ...t });

test("each type goes to its own department; a plain request goes where the person picked (M-06 2.2, 3.1)", () => {
  assert.equal(ticketDepartment(ticketType("hr_letter")!, "Inventory"), "HR"); // (36) straight to HR
  assert.equal(ticketDepartment(ticketType("dispute")!, null), "الإدارة");
  assert.equal(ticketDepartment(ticketType("list")!, null), "Inventory");
  assert.equal(ticketDepartment(ticketType("purchase")!, null), "Accounts");
  assert.equal(ticketDepartment(ticketType("request")!, "Inventory"), "Inventory");
  assert.equal(ticketDepartment(ticketType("request")!, null), null);
  assert.equal(ticketDepartment(ticketType("excuse")!, null), "HR"); // 7.4: a system type, decided in HR's flow
  assert.equal(ticketType("excuse")!.system, true);
});

test("M-06 7.1: sales opens a ticket to Inventory, nobody answers in 24 working hours → late, escalated to Inventory's manager", () => {
  const t = ticket({ createdAt: at("2026-11-08T09:00:00Z") }); // Sun 11:00
  assert.equal(ticketType(t.type)!.escalateTo, "manager");
  assert.equal(isTicketLate(t, at("2026-11-09T09:00:00Z")), false); // 24 clock hours = only 8 working hours
  assert.equal(isTicketLate(t, at("2026-11-10T16:59:00Z")), false); // Tue 18:59: 1439 working minutes
  assert.equal(isTicketLate(t, at("2026-11-11T09:01:00Z")), true); // Wed 11:01: 1441
  assert.equal(isTicketLate({ ...t, firstReplyAt: at("2026-11-10T10:00:00Z") }, at("2026-11-11T09:01:00Z")), false); // answered in time
});

test("high priority: 4 working hours, a Friday doesn't count (M-06 2.4)", () => {
  const t = ticket({ priority: "high", createdAt: at("2026-11-12T15:00:00Z") }); // Thu 17:00 → 2h Thu, Fri off, 2h Sat
  assert.equal(isTicketLate(t, at("2026-11-13T16:00:00Z")), false); // Friday 18:00
  assert.equal(isTicketLate(t, at("2026-11-14T10:59:00Z")), false); // Sat 12:59
  assert.equal(isTicketLate(t, at("2026-11-14T11:01:00Z")), true); // Sat 13:01
});

test("a dispute must be settled in 48 hours, a reply doesn't stop the clock; Nancy is the one told", () => {
  const t = ticket({ type: "dispute", createdAt: at("2026-11-08T09:00:00Z"), firstReplyAt: at("2026-11-08T10:00:00Z"), status: "In Progress" });
  assert.equal(ticketType("dispute")!.escalateTo, "officemgr");
  assert.equal(isTicketLate(t, at("2026-11-10T08:59:00Z")), false);
  assert.equal(isTicketLate(t, at("2026-11-10T09:01:00Z")), true);
  assert.equal(isTicketLate({ ...t, status: "Resolved", resolvedAt: at("2026-11-09T09:00:00Z") }, at("2026-11-12T09:00:00Z")), false);
});

test("HR Letter: 24 hours, high priority doesn't change it", () => {
  const t = ticket({ type: "hr_letter", priority: "high", createdAt: at("2026-11-08T09:00:00Z") });
  assert.equal(isTicketLate(t, at("2026-11-08T14:00:00Z")), false);
  assert.equal(isTicketLate(t, at("2026-11-09T09:01:00Z")), true);
});

test("a reply: the department's first reply opens work (In Progress) or sets the status it picked; the requester's doesn't move it", () => {
  assert.equal(statusAfterReply("Open", true, undefined), "In Progress");
  assert.equal(statusAfterReply("In Progress", true, "Resolved"), "Resolved");
  assert.equal(statusAfterReply("In Progress", true, undefined), "In Progress");
  assert.equal(statusAfterReply("Open", false, undefined), "Open");
});

test("the response report per department: closed in the SLA ÷ all tickets, and the average first reply (M-06 6.1, 3.2)", () => {
  const sun = "2026-11-08T09:00:00Z";
  const inv = (resolved: string | null, reply: string | null) => ({ ...ticket({ createdAt: at(sun), resolvedAt: resolved ? at(resolved) : null, firstReplyAt: reply ? at(reply) : null }), department: "Inventory" });
  const rows = slaReport([
    inv("2026-11-08T10:00:00Z", "2026-11-08T09:30:00Z"), // 30 min to reply
    inv("2026-11-09T09:00:00Z", "2026-11-08T10:30:00Z"), // 90
    inv("2026-11-10T09:00:00Z", "2026-11-08T09:20:00Z"), // 20, closed after 16 working hours → still in the 24
    inv("2026-11-12T09:00:00Z", null), // closed after 32 working hours → missed
    { ...ticket({ type: "dispute", createdAt: at(sun), resolvedAt: at("2026-11-09T09:00:00Z") }), department: "الإدارة" },
  ], ["HR", "Inventory", "الإدارة"]);
  assert.deepEqual(rows.map((r) => [r.department, r.total, r.closedInSla, r.percent, r.avgReplyMinutes]), [
    ["HR", 0, 0, null, null],
    ["Inventory", 4, 3, 75, 47],
    ["الإدارة", 1, 1, 100, null],
  ]);
  assert.equal(closedInSla(ticket({ createdAt: at(sun) })), false); // still open = not closed in the SLA
});

test("15 Nov: a ticket sent to named people — they handle it from any department; its department's staff don't, its head does", () => {
  const viewer = (v: Partial<TicketViewer>): TicketViewer => ({ id: "x", department: null, seesAll: false, managesDepartment: false, ...v });
  const toPeople: TicketAudience = { fromUserId: "anas", department: "Marketing", forDepartment: false, assigneeIds: ["rahma", "manar"] };
  assert.equal(handlesTicket(viewer({ id: "manar", department: "Inventory" }), toPeople), true); // assigned, other department
  assert.equal(handlesTicket(viewer({ id: "staff", department: "Marketing" }), toPeople), false);
  assert.equal(seesTicket(viewer({ id: "staff", department: "Marketing" }), toPeople), false);
  assert.equal(handlesTicket(viewer({ id: "head", department: "Marketing", managesDepartment: true }), toPeople), true);
  assert.equal(handlesTicket(viewer({ id: "head", department: "HR", managesDepartment: true }), toPeople), false);
  assert.equal(handlesTicket(viewer({ id: "admin", seesAll: true }), toPeople), true);
  // the one who opened it sees it and writes, but doesn't handle it
  assert.equal(seesTicket(viewer({ id: "anas", department: "المبيعات" }), toPeople), true);
  assert.equal(handlesTicket(viewer({ id: "anas", department: "المبيعات" }), toPeople), false);
});

test("a department's ticket keeps working as before: anyone in it handles it, even after one of them took it", () => {
  const toDept: TicketAudience = { fromUserId: "anas", department: "Inventory", forDepartment: true, assigneeIds: ["marwa"] };
  const v = (id: string, department: string): TicketViewer => ({ id, department, seesAll: false, managesDepartment: false });
  assert.equal(handlesTicket(v("manar", "Inventory"), toDept), true);
  assert.equal(seesTicket(v("rahma", "Marketing"), toDept), false);
});
