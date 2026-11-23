import { test } from "node:test";
import assert from "node:assert/strict";
import { channelTypeProblem, channelTypesChange, channelTypesOf } from "../src/channel-types.ts";

const on = (value: string) => ({ value, active: true }), off = (value: string) => ({ value, active: false });
const TYPES = { Instagram: [on("Reel"), on("Story"), off("Live")], Facebook: [] };
const CHANNELS = ["Facebook", "Instagram", "Website"];

test("a channel offers its active types; a channel without a list offers none", () => {
  assert.deepEqual(channelTypesOf(TYPES, "Instagram"), ["Reel", "Story"]);
  assert.deepEqual(channelTypesOf(TYPES, "Facebook"), []);
  assert.deepEqual(channelTypesOf(TYPES, "Website"), []);
  assert.deepEqual(channelTypesOf(TYPES, undefined), []);
});

test("a lead's type: one of its channel's active types, its own old one, or none", () => {
  assert.equal(channelTypeProblem(TYPES, "Instagram", "Reel"), null);
  assert.equal(channelTypeProblem(TYPES, "Instagram", undefined), null);
  assert.equal(channelTypeProblem(TYPES, "Instagram", "Live", "Live"), null); // switched off since: the lead keeps it
  assert.equal(channelTypeProblem(TYPES, "Instagram", "Live"), "«Live» مش من أنواع «Instagram»");
  assert.equal(channelTypeProblem(TYPES, "Instagram", "Banner"), "«Banner» مش من أنواع «Instagram»");
  assert.equal(channelTypeProblem(TYPES, "Website", "Reel"), "«Website» مالهاش أنواع");
});

test("saving the lists: under known channels only, switched off not deleted, and what the save does", () => {
  assert.deepEqual(channelTypesChange(TYPES, { ...TYPES, Website: [on("Blog")] }, CHANNELS), { problem: null, actions: ["add"] });
  assert.deepEqual(channelTypesChange(TYPES, { ...TYPES, Instagram: [on("Reel"), off("Story"), off("Live")] }, CHANNELS), { problem: null, actions: ["off"] });
  assert.equal(channelTypesChange(TYPES, { ...TYPES, TikTok: [on("Video")] }, CHANNELS).problem, "«TikTok» مش Channel في القايمة");
  assert.match(channelTypesChange(TYPES, { ...TYPES, Instagram: [on("Reel")] }, CHANNELS).problem ?? "", /«Story» ماتتمسحش/);
  assert.match(channelTypesChange(TYPES, { Facebook: [] }, CHANNELS).problem ?? "", /«Reel» ماتتمسحش/); // a whole list dropped
  assert.deepEqual(channelTypesChange(TYPES, TYPES, CHANNELS), { problem: null, actions: [] });
});
