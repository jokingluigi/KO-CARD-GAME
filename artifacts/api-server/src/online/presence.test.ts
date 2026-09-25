import assert from "node:assert/strict";
import test from "node:test";
import { clearActiveMatchPresenceForUsers, lobbyPresence } from "./presence";

test("terminal match cleanup clears only stale active-match presence", () => {
  lobbyPresence.clear();
  lobbyPresence.set("finished-player", "ACTIVE_MATCH");
  lobbyPresence.set("queued-player", "QUICK_QUEUE");
  lobbyPresence.set("room-player", "PRIVATE_ROOM");

  clearActiveMatchPresenceForUsers("finished-player", "queued-player", null);

  assert.equal(lobbyPresence.get("finished-player"), "IDLE");
  assert.equal(lobbyPresence.get("queued-player"), "QUICK_QUEUE");
  assert.equal(lobbyPresence.get("room-player"), "PRIVATE_ROOM");
  lobbyPresence.clear();
});