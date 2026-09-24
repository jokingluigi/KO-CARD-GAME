import assert from "node:assert/strict";
import test from "node:test";

import { shouldPreventAltWheel, shouldToggleAltInfo } from "./alt-inspector-keyboard.ts";

const keydown = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key: "Alt",
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;

test("standalone Alt keydown toggles the card info mode", () => {
  assert.equal(shouldToggleAltInfo(keydown(), false), true);
});

test("Alt key repeat and modifier shortcuts do not toggle the mode", () => {
  assert.equal(shouldToggleAltInfo(keydown({ repeat: true }), false), false);
  assert.equal(shouldToggleAltInfo(keydown({ ctrlKey: true }), false), false);
  assert.equal(shouldToggleAltInfo(keydown({ metaKey: true }), false), false);
  assert.equal(shouldToggleAltInfo(keydown({ shiftKey: true }), false), false);
  assert.equal(shouldToggleAltInfo(keydown({ key: "Tab" }), false), false);
});

test("Alt alone is ignored while an editable control has focus", () => {
  assert.equal(shouldToggleAltInfo(keydown(), true), false);
});

test("wheel history suppression requires a physical Alt+wheel gesture", () => {
  assert.equal(shouldPreventAltWheel({ altKey: false }), false);
  assert.equal(shouldPreventAltWheel({ altKey: true }), true);
});