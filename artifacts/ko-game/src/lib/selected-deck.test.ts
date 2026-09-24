import assert from "node:assert/strict";
import test from "node:test";
import { resolveAvailableDeckId } from "./selected-deck";

const decks = [
  { id: "invalid", isValid: false },
  { id: "first-valid", isValid: true },
  { id: "second-valid", isValid: true },
];

test("keeps a still-valid selected fixture deck", () => {
  assert.equal(resolveAvailableDeckId(decks, "second-valid"), "second-valid");
});

test("falls back when the selected fixture deck is deleted or invalid", () => {
  assert.equal(resolveAvailableDeckId(decks, "deleted"), "first-valid");
  assert.equal(resolveAvailableDeckId(decks, "invalid"), "first-valid");
});

test("clears selection when the fixture list is empty", () => {
  assert.equal(resolveAvailableDeckId([], "deleted"), null);
});