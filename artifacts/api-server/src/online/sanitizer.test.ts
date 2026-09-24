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

test("effects that modify a hidden opponent hand card do not expose its identity", () => {
  const state = {
    cardPool: [],
    players: [
      { id: "PLAYER_ONE", hand: [], deck: [] },
      { id: "PLAYER_TWO", hand: [{ instanceId: "hidden-hand-card", definitionId: "secret" }], deck: [] },
    ],
    events: [{
      type: "STAT_CHANGED",
      playerId: "PLAYER_TWO",
      cardInstanceId: "hidden-hand-card",
      source: { type: "CARD", cardInstanceId: "public-source" },
      target: { type: "CARD", cardInstanceId: "hidden-hand-card" },
      stat: "cost",
      before: 5,
      after: 7,
      delta: 2,
    }],
  } as unknown as GameState;
  const projected = sanitizeGameStateForViewer(state, "PLAYER_ONE") as { events: Array<Record<string, unknown>> };
  assert.equal(projected.events[0]?.cardInstanceId, undefined);
  assert.equal(projected.events[0]?.target, undefined);
  assert.equal((projected.events[0]?.source as { cardInstanceId?: string } | undefined)?.cardInstanceId, "public-source");
});

test("hidden card-text grants redact donor metadata while public board grants remain inspectable", () => {
  const state = {
    cardPool: [publicDefinition],
    randomSeed: 123,
    players: [
      { id: "PLAYER_ONE", hand: [], deck: [], board: [{ instanceId: "public-board-card", definitionId: "published-card" }] },
      { id: "PLAYER_TWO", hand: [{ instanceId: "hidden-hand-card", definitionId: "secret" }], deck: [], board: [] },
    ],
    events: [
      {
        type: "CARD_TEXT_GRANTED",
        playerId: "PLAYER_TWO",
        cardInstanceId: "hidden-hand-card",
        source: { type: "CARD", cardInstanceId: "public-board-card" },
        target: { type: "CARD", cardInstanceId: "hidden-hand-card" },
        grantedFromDefinitionId: "secret-donor",
      },
      {
        type: "CARD_TEXT_GRANTED",
        playerId: "PLAYER_ONE",
        cardInstanceId: "public-board-card",
        source: { type: "CARD", cardInstanceId: "public-board-card" },
        target: { type: "CARD", cardInstanceId: "public-board-card" },
        grantedFromDefinitionId: "published-card",
      },
    ],
  } as unknown as GameState;
  const projected = sanitizeGameStateForViewer(state, "PLAYER_ONE") as { events: Array<Record<string, unknown>> };
  assert.equal(projected.events[0]?.grantedFromDefinitionId, undefined);
  assert.equal(projected.events[1]?.grantedFromDefinitionId, "published-card");
});

test("targeting snapshots never expose hidden opponent ids", () => {
  const hidden = { instanceId: "hidden-target", definitionId: "secret" };
  const state = {
    cardPool: [],
    players: [
      { id: "PLAYER_ONE", hand: [], deck: [], board: [] },
      { id: "PLAYER_TWO", hand: [hidden], deck: [], board: [] },
    ],
    events: [],
    targetingState: {
      active: true, playerId: "PLAYER_ONE", sourceInstanceId: "hidden-target",
      sourceCard: hidden, effects: [], effectIndex: 0,
      validTargetIds: ["hidden-target", "public-target"],
      selectedTargetIds: ["hidden-target"], lastTargetIds: ["hidden-target"],
      minTargets: 1, maxTargets: 1, mandatory: true, cancelable: false,
      continuation: {
        active: true, playerId: "PLAYER_ONE", sourceInstanceId: "public-source",
        effects: [], effectIndex: 0, validTargetIds: ["hidden-target"],
        selectedTargetIds: ["hidden-target"], lastTargetIds: ["hidden-target"],
        minTargets: 1, maxTargets: 1, mandatory: true, cancelable: false,
      },
      scriptContinuation: {
        selectedResultId: "selected",
        remainingSteps: [],
        registers: { selected: { ids: ["hidden-target"] } },
        script: { steps: [] },
      },
    },
  } as unknown as GameState;
  const targeting = (sanitizeGameStateForViewer(state, "PLAYER_ONE") as { targetingState: Record<string, any> }).targetingState;
  assert.deepEqual(targeting.validTargetIds, ["public-target"]);
  assert.deepEqual(targeting.selectedTargetIds, []);
  assert.deepEqual(targeting.lastTargetIds, []);
  assert.equal(targeting.sourceCard, undefined);
  assert.deepEqual(targeting.scriptContinuation.registers.selected.ids, []);
  assert.deepEqual(targeting.continuation.validTargetIds, []);
});