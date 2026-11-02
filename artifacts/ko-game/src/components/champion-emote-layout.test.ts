import test from "node:test";
import assert from "node:assert/strict";
import { championEmoteLayout } from "./champion-emote-layout";
test("mobile communication stays in decorative art instead of vital HUD or cards, on both sides", () => {
  const rect = { left: 110, top: 510, width: 145, height: 150 };
  for (const self of [false, true]) {
    const p = championEmoteLayout(rect, { width: 390, height: 844 }, self);
    assert.ok(p.left >= rect.left);
    assert.ok(p.left + p.size <= rect.left + rect.width);
    assert.ok(p.top >= rect.top);
    assert.ok(p.top + p.size <= rect.top + rect.height);
  }
});
test("resizing recalculates the position rather than retaining stale pixels", () => {
  const a = championEmoteLayout(
      { left: 100, top: 100, width: 160, height: 180 },
      { width: 390, height: 844 },
      true,
    ),
    b = championEmoteLayout(
      { left: 600, top: 40, width: 220, height: 210 },
      { width: 844, height: 390 },
      true,
    );
  assert.notEqual(a.left, b.left);
  assert.ok(b.left + b.size <= 844);
  assert.ok(b.top + b.size <= 390);
});
