import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedValue, asListValues, canChangeList, canEditSetting, defaultListEditors, listActions, listChangeProblem } from "../src/lists.ts";

const on = (value: string) => ({ value, active: true });
const off = (value: string) => ({ value, active: false });
// the client's areas (seed) and the accountant's receive sources (4 Nov)
const areas = [on("التجمع الخامس"), on("الشيخ زايد"), on("أكتوبر")];
const sources = [on("عمولة من عميل"), on("إيراد آخر"), on("استرداد")];

test("adding and switching off are fine; nothing is ever removed (M-13 2.1: تتوقف بدل ما تتمسح)", () => {
  assert.equal(listChangeProblem(areas, [...areas, on("المعادي")]), null);
  assert.equal(listChangeProblem(areas, [areas[0]!, off("الشيخ زايد"), areas[2]!]), null);
  assert.equal(listChangeProblem([off("الشيخ زايد")], [on("الشيخ زايد")]), null); // back on
  assert.match(listChangeProblem(areas, [areas[0]!, areas[2]!])!, /الشيخ زايد.*ماتتمسحش/);
});

test("a locked value (the system posts on it) can't be switched off or removed", () => {
  const locked = ["عمولة من عميل"];
  assert.equal(listChangeProblem(sources, [...sources, on("إيجار")], locked), null);
  assert.equal(listChangeProblem(sources, [sources[0]!, off("إيراد آخر"), sources[2]!], locked), null);
  assert.match(listChangeProblem(sources, [off("عمولة من عميل"), sources[1]!, sources[2]!], locked)!, /عمولة من عميل.*ماتتوقفش/);
  assert.match(listChangeProblem(sources, sources.slice(1), locked)!, /عمولة من عميل/);
});

test("old plain-text lists read as all active", () => {
  assert.deepEqual(asListValues(["Facebook", "TikTok"]), [on("Facebook"), on("TikTok")]);
  assert.deepEqual(asListValues([off("TikTok")]), [off("TikTok")]);
  assert.deepEqual(asListValues(null), []);
});

test("a form stores an active value, or keeps the one the record already has after it was switched off", () => {
  const list = [on("متشطب"), off("نص تشطيب")];
  assert.equal(allowedValue(list, "متشطب"), true);
  assert.equal(allowedValue(list, "نص تشطيب"), false); // a new record can't pick it
  assert.equal(allowedValue(list, "نص تشطيب", "نص تشطيب"), true); // an old one keeps it
  assert.equal(allowedValue(list, "مفروش"), false);
});

test("what a save does: add, switch off / back on, both, or nothing (#186)", () => {
  assert.deepEqual(listActions(areas, [...areas, on("المعادي")]), ["add"]);
  assert.deepEqual(listActions(areas, [areas[0]!, off("الشيخ زايد"), areas[2]!]), ["off"]);
  assert.deepEqual(listActions([off("أكتوبر")], [on("أكتوبر")]), ["off"]); // «رجّع» is the same right as «وقّف»
  assert.deepEqual(listActions(areas, [off("التجمع الخامس"), areas[1]!, areas[2]!, on("المعادي")]).sort(), ["add", "off"]);
  assert.deepEqual(listActions(areas, areas), []);
});

test("who changes a list: its own roles / people once set, «master: edit» until then (#186)", () => {
  const hr = { id: "u-hr", roles: ["hr"], masterEdit: true };
  const ops = { id: "u-ops", roles: ["ops"], masterEdit: false };
  assert.equal(canChangeList(undefined, "add", hr), true);
  assert.equal(canChangeList(undefined, "add", ops), false);
  const rule = { add: ["ops"], off: ["u-hr"] };
  assert.equal(canChangeList(rule, "add", ops), true); // the role, without «master: edit»
  assert.equal(canChangeList(rule, "off", ops), false);
  assert.equal(canChangeList(rule, "add", hr), false); // «master: edit» no longer enough once the list is set up
  assert.equal(canChangeList(rule, "off", hr), true); // by name
  assert.equal(canChangeList({ add: [], off: [] }, "add", hr), false);
});

test("each department's settings for its manager only, the money rules for the Super Admin only (M-13 1.2 · 2.2 · 4.1)", () => {
  const admin = { roles: ["admin"], masterEdit: true, accessEdit: true };
  const hr = { roles: ["hr"], masterEdit: true, accessEdit: false };
  const marketing = { roles: ["marketing"], masterEdit: true, accessEdit: false };
  const office = { roles: ["officemgr", "approver"], masterEdit: true, accessEdit: true };
  const sales = { roles: ["sales"], masterEdit: false, accessEdit: false };
  // the HR: leave types and holidays · the marketing: channels and the WhatsApp limit · not each other's
  assert.equal(canEditSetting("leaveTypes", hr), true);
  assert.equal(canEditSetting("holidays", hr), true);
  assert.equal(canEditSetting("leaveTypes", marketing), false);
  assert.equal(canEditSetting("whatsappDailyLimit", marketing), true);
  assert.equal(canEditSetting("channels", marketing), true);
  assert.equal(canEditSetting("whatsappDailyLimit", hr), false);
  assert.equal(canEditSetting("leaveTypes", office), false); // «master: edit» alone isn't the HR
  assert.equal(canEditSetting("leaveTypes", { roles: ["hr"], masterEdit: false, accessEdit: false }), false); // the role without the right
  // the Super Admin: everything, and alone on the money rules and the areas
  for (const key of ["leaveTypes", "channels", "areas", "procurementBigApprovers", "notificationsFrom", "vendors"]) assert.equal(canEditSetting(key, admin), true);
  assert.equal(canEditSetting("procurementBigApprovers", office), false);
  assert.equal(canEditSetting("areas", marketing), false);
  // roles and editors: whoever manages access · a list without a department: «master: edit», as before
  assert.equal(canEditSetting("listEditors", office), true);
  assert.equal(canEditSetting("leadLogRoles", hr), false);
  assert.equal(canEditSetting("vendors", office), true);
  assert.equal(canEditSetting("vendors", sales), false);
});

test("«مين يعدّل» starts from the list's department, else from today's «master: edit» roles (#186 · M-13 1.2)", () => {
  assert.deepEqual(defaultListEditors("channels", ["hr", "marketing", "officemgr"]), ["admin", "marketing"]);
  assert.deepEqual(defaultListEditors("areas", ["hr", "marketing"]), ["admin"]);
  assert.deepEqual(defaultListEditors("vendors", ["hr", "officemgr"]), ["hr", "officemgr"]);
});
