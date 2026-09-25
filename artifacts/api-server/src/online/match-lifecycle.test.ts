import assert from "node:assert/strict";
import test from "node:test";
import { classifyActiveMatch } from "./match-lifecycle";

test("only active matches with an in-progress game state can be resumed", () => {
  assert.equal(classifyActiveMatch("ACTIVE", "IN_PROGRESS"), "RESUMABLE");
  assert.equal(classifyActiveMatch("ACTIVE", "FINISHED"), "FINISHED");
  assert.equal(classifyActiveMatch("ACTIVE", null), "UNRESUMABLE");
});

test("persisted waiting and terminal statuses are not active resumable matches", () => {
  for (const status of ["WAITING", "ENDED", "CANCELLED"]) {
    assert.equal(classifyActiveMatch(status, "IN_PROGRESS"), "UNRESUMABLE");
    assert.equal(classifyActiveMatch(status, "FINISHED"), "UNRESUMABLE");
  }
});