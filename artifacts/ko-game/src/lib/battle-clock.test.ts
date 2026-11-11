import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSecondDelay, secondsUntil } from "./battle-clock";
test("online clock follows authoritative deadline, offset, expiry and resume", () => {
  assert.equal(secondsUntil(10000, 500, 6000), 4);
  assert.equal(secondsUntil(10000, 500, 9500), 0);
  assert.equal(secondsUntil(10000, 500, 20000), 0);
  assert.equal(secondsUntil(null, 500, 6000, 70), 70);
  assert.equal(nextSecondDelay(10000, 500, 6000), 501);
  assert.equal(nextSecondDelay(10000, 500, 6501), 1000);
  assert.equal(nextSecondDelay(10000, 500, 9500), null);
});
