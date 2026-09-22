import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@workspace/game-engine";
import { sanitizeGameStateForViewer } from "./sanitizer";

const publicDefinition = {
  id: "published-card", name: "Published Card", cardType: "WRESTLER", cost: 2, attack: 3, health: 4,
  rulesText: "Public rules", isToken: false, isChampionToken: false, keywords: [], abilities: [],
};

test("preserves public catalog while hiding random seed and opponent zones", () => {
  const state = {
    cardPool: [publicDefinition], randomSeed: 123,
    players: [
      { id: "PLAYER_ONE", hand: [{ instanceId: "own-hand-card", definitionId: "own-secret-definition" }], deck: [{ instanceId: "own-deck-card", definitionId: "own-deck-definition" }] },
      { id: "PLAYER_TWO", hand: [{ instanceId: "opponent-hand-card", definitionId: "opponent-secret-definition" }], deck: [{ instanceId: "opponent-deck-card-1", definitionId: "opponent-deck-definition-1" }, { instanceId: "opponent-deck-card-2", definitionId: "opponent-deck-definition-2" }] },
    ],
    events: [],
  } as unknown as GameState;
  const projected = sanitizeGameStateForViewer(state, "PLAYER_ONE") as { cardPool: unknown[]; randomSeed?: unknown; players: Array<{ id: string; hand: unknown; deck: unknown }> };
  assert.deepEqual(projected.cardPool, [publicDefinition]);
  assert.equal(projected.randomSeed, undefined);
  assert.deepEqual(projected.players[0]?.hand, state.players[0]?.hand);
  assert.deepEqual(projected.players[0]?.deck, state.players[0]?.deck);
  assert.deepEqual(projected.players[1]?.hand, { hidden: true, count: 1 });
  assert.deepEqual(projected.players[1]?.deck, { hidden: true, count: 2 });
});

test("historical opponent draw and generation events stay redacted", () => {
  const state = {
    cardPool: [], randomSeed: 123, players: [{ id: "PLAYER_ONE", hand: [], deck: [] }, { id: "PLAYER_TWO", hand: [], deck: [] }],
    events: [
      { type: "CARD_DRAWN", playerId: "PLAYER_TWO", cardInstanceId: "secret-draw", source: { type: "SYSTEM" }, target: { type: "CARD", cardInstanceId: "secret-draw" }, sourceSnapshot: { cardInstanceId: "secret-draw" }, targetSnapshot: { cardInstanceId: "secret-draw" } },
      { type: "CARD_GENERATED", playerId: "PLAYER_TWO", cardInstanceId: "secret-generated", source: { type: "CARD", cardInstanceId: "source-card" }, target: { type: "CARD", cardInstanceId: "secret-generated" }, sourceSnapshot: { cardInstanceId: "source-card" }, targetSnapshot: { cardInstanceId: "secret-generated" } },
    ],
  } as unknown as GameState;
  const projected = sanitizeGameStateForViewer(state, "PLAYER_ONE") as { events: Array<Record<string, unknown>> };
  for (const event of projected.events) {
    assert.equal(event.cardInstanceId, undefined);
    assert.equal(event.target, undefined);
    assert.equal(event.source, undefined);
    assert.equal(event.sourceSnapshot, undefined);
    assert.equal(event.targetSnapshot, undefined);
  }
});