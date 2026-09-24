import assert from "node:assert/strict";
import test from "node:test";
import { compareAndAdvanceChampionVersion } from "./champion-save-contract";

test("Champion fixture updates advance the version exactly once across 20 saves", () => {
  let version = 1;
  for (let update = 0; update < 20; update += 1) {
    const result = compareAndAdvanceChampionVersion(version, version);
    assert.deepEqual(result, { ok: true, version: version + 1 });
    version = result.version;
  }
  assert.equal(version, 21);
});

test("stale Champion fixture update is rejected with a version conflict", () => {
  assert.deepEqual(compareAndAdvanceChampionVersion(8, 7), {
    ok: false,
    status: 409,
    field: "version",
  });
});