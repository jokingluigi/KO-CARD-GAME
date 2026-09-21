import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@workspace/game-engine";
import { sanitizeGameStateForViewer } from "./sanitizer";

test("historical opponent draw and generation events stay redacted after the card leaves hand", () => {
  const state = {
    cardPool: [],
    randomSeed: 123,
    players: [
      { id: "PLAYER_ONE", hand: [], deck: [] },
      { id: "PLAYER_TWO", hand: [], deck: [] },
    ],
    events: [
      {
        type: "CARD_DRAWN",
        playerId: "PLAYER_TWO",
        cardInstanceId: "secret-draw",
        source: { type: "SYSTEM" },
        target: { type: "CARD", cardInstanceId: "secret-draw" },
      },
      {
        type: "CARD_GENERATED",
        playerId: "PLAYER_TWO",
        cardInstanceId: "secret-generated",
        source: { type: "CARD", cardInstanceId: "source-card" },
        target: { type: "CARD", cardInstanceId: "secret-generated" },
      },
    ],
  } as unknown as GameState;

  const projected = sanitizeGameStateForViewer(state, "PLAYER_ONE") as {
    events: Array<Record<string, unknown>>;
  };

  assert.equal(projected.events[0]?.cardInstanceId, undefined);
  assert.equal(projected.events[0]?.target, undefined);
  assert.equal(projected.events[1]?.cardInstanceId, undefined);
  assert.equal(projected.events[1]?.source, undefined);
  assert.equal(projected.events[1]?.target, undefined);
});