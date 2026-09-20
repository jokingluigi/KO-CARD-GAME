import assert from "node:assert/strict";
import test from "node:test";
import { parseCardTags } from "@workspace/api-zod";

test("card tags default to an empty array when omitted", () => {
  assert.deepEqual(parseCardTags(undefined), []);
});

test("card tags trim values and preserve input order", () => {
  assert.deepEqual(parseCardTags([" 용병 ", "인간", "기계"]), ["용병", "인간", "기계"]);
});

test("card tags reject four values, blanks, and duplicates", () => {
  assert.equal(parseCardTags(["a", "b", "c", "d"]), null);
  assert.equal(parseCardTags(["a", " "]), null);
  assert.equal(parseCardTags(["a", "a"]), null);
  assert.equal(parseCardTags("a"), null);
});