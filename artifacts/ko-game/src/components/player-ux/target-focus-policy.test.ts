import test from "node:test";
import assert from "node:assert/strict";
import { clipFocusRect } from "./target-focus-policy";
test("visible target holes stop at the viewport and scroll container instead of lighting neighbors", () => {
  const r = clipFocusRect(
    { x: -20, y: 100, width: 100, height: 140 },
    { x: 0, y: 0, width: 390, height: 844 },
  );
  assert.deepEqual(r, { x: 0, y: 100, width: 80, height: 140 });
  assert.deepEqual(
    clipFocusRect(r!, { x: 10, y: 110, width: 50, height: 100 }),
    { x: 10, y: 110, width: 50, height: 100 },
  );
  assert.equal(
    clipFocusRect(
      { x: 400, y: 100, width: 80, height: 100 },
      { x: 0, y: 0, width: 390, height: 844 },
    ),
    null,
  );
  assert.equal(
    clipFocusRect(
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: 390, height: 844 },
    ),
    null,
  );
});
