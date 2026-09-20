import assert from "node:assert/strict";
import test from "node:test";
import { sharesCardTag } from "./tags";

test("sharesCardTag detects at least one identical canonical tag", () => {
  assert.equal(sharesCardTag({ tags: ["용병", "인간"] }, { tags: ["용병"] }), true);
  assert.equal(sharesCardTag({ tags: ["용병"] }, { tags: ["악마"] }), false);
  assert.equal(sharesCardTag({ tags: [] }, { tags: ["용병"] }), false);
  assert.equal(sharesCardTag({}, { tags: ["용병"] }), false);
});