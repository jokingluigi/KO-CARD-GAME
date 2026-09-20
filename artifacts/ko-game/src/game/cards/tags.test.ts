import assert from "node:assert/strict";
import test from "node:test";
import { hasCardTag, matchesCardTagFilter, sharesCardTag } from "./tags";

test("sharesCardTag detects at least one identical canonical tag", () => {
  assert.equal(sharesCardTag({ tags: ["용병", "인간"] }, { tags: ["용병"] }), true);
  assert.equal(sharesCardTag({ tags: ["용병"] }, { tags: ["악마"] }), false);
  assert.equal(sharesCardTag({ tags: [] }, { tags: ["용병"] }), false);
  assert.equal(sharesCardTag({}, { tags: ["용병"] }), false);
});

test("card tag filters support any, all, and none semantics", () => {
  const card = { tags: ["용병", "인간"] };
  assert.equal(hasCardTag(card, "용병"), true);
  assert.equal(matchesCardTagFilter(card, { tagsAny: ["악마", "인간"] }), true);
  assert.equal(matchesCardTagFilter(card, { tagsAny: ["악마"] }), false);
  assert.equal(matchesCardTagFilter(card, { tagsAll: ["용병", "인간"] }), true);
  assert.equal(matchesCardTagFilter(card, { tagsAll: ["용병", "악마"] }), false);
  assert.equal(matchesCardTagFilter(card, { tagsNone: ["악마"] }), true);
  assert.equal(matchesCardTagFilter(card, { tagsNone: ["인간"] }), false);
  assert.equal(matchesCardTagFilter({}, { tagsAny: ["용병"] }), false);
});