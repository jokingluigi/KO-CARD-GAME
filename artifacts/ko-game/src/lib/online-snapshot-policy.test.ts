import test from "node:test";
import assert from "node:assert/strict";
import { acceptsSnapshotVersion } from "./online-snapshot-policy";
test("snapshots can refresh equal versions but stale or malformed versions never rewind state", () => {
  assert.equal(acceptsSnapshotVersion(null, 0), true);
  assert.equal(acceptsSnapshotVersion(5, 5), true);
  assert.equal(acceptsSnapshotVersion(5, 6), true);
  for (const n of [4, -1, NaN, Infinity, 2.5])
    assert.equal(acceptsSnapshotVersion(5, n), false);
});
