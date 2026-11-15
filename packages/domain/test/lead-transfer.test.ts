import { test } from "node:test";
import assert from "node:assert/strict";
import { commentVisible, commentsFromAfterTransfer, transferTargetAllowed, transfersLeads } from "../src/lead-transfer.ts";

const at = (iso: string) => new Date(`${iso}+02:00`);
const cut = at("2026-11-15T12:00:00");

test("14.7: by default the new holder sees only the comments written after the transfer", () => {
  assert.equal(commentsFromAfterTransfer(null, false, cut), cut);
  assert.equal(commentVisible({ kind: "comment", at: at("2026-11-15T11:59:00") }, cut, ["sales"]), false);
  assert.equal(commentVisible({ kind: "comment", at: at("2026-11-15T12:00:00") }, cut, ["sales"]), true);
  assert.equal(commentVisible({ kind: "comment", at: at("2026-11-15T11:00:00") }, cut, ["tl"]), false); // his TL too
});

test("14.7: «يشوف الكومنتات القديمة» keeps the earlier cut-off, so he sees what the last holder saw", () => {
  assert.equal(commentsFromAfterTransfer(null, true, cut), null);
  const earlier = at("2026-11-01T12:00:00");
  assert.equal(commentsFromAfterTransfer(earlier, true, cut), earlier);
});

test("14.7: the Super Admin always sees the whole history; the automatic lines stay for everyone", () => {
  assert.equal(commentVisible({ kind: "comment", at: at("2026-11-10T10:00:00") }, cut, ["admin"]), true);
  assert.equal(commentVisible({ kind: "stage", at: at("2026-11-10T10:00:00") }, cut, ["sales"]), true);
});

test("14.7: a Team Leader transfers only inside his team; the Sales Director anywhere", () => {
  assert.equal(transferTargetAllowed("team", ["tl1", "s1", "s2"], "s2"), true);
  assert.equal(transferTargetAllowed("team", ["tl1", "s1", "s2"], "x9"), false);
  assert.equal(transferTargetAllowed("all", [], "x9"), true);
  assert.equal(transfersLeads(["tl"], false), true);
  assert.equal(transfersLeads(["sales"], false), false);
  assert.equal(transfersLeads(["ops"], true), true);
});
