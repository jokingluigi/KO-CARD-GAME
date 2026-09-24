import assert from "node:assert/strict";
import test from "node:test";
import type { GameAction, GameState } from "@workspace/game-engine";
import { directActionStartsTargeting, rejectedActionCode } from "./action-validation";

function gameState(overrides: Record<string, unknown> = {}): GameState {
  return {
    status: "IN_PROGRESS",
    activePlayerId: "PLAYER_ONE",
    ...overrides,
  } as unknown as GameState;
}

test("unwrapped card and ability actions cannot commit while they start targeting", () => {
  const targetedState = gameState({ targetingState: { active: true } });
  const directActions: GameAction[] = [
    { type: "PLAY_TECHNIQUE", playerId: "PLAYER_ONE", cardInstanceId: "technique-1" },
    { type: "USE_ACTIVE", playerId: "PLAYER_ONE", cardInstanceId: "wrestler-1" },
    { type: "USE_CHAMPION_ABILITY", playerId: "PLAYER_ONE" },
  ];
  for (const action of directActions) {
    assert.equal(directActionStartsTargeting(action, targetedState), true);
    assert.equal(directActionStartsTargeting(action, gameState()), false);
  }

  assert.equal(directActionStartsTargeting({
    type: "BEGIN_TARGETED_ACTION",
    playerId: "PLAYER_ONE",
    action: { type: "USE_CHAMPION_ABILITY" },
  }, targetedState), false);
  assert.equal(directActionStartsTargeting({
    type: "PLAY_WRESTLER",
    playerId: "PLAYER_ONE",
    cardInstanceId: "wrestler-1",
    boardSlot: 0,
  }, targetedState), false);
});

test("only contextually invalid selections or an otherwise-valid attack target map to INVALID_TARGET", () => {
  const selectionState = gameState({
    targetingState: { active: true, playerId: "PLAYER_ONE", phase: "SELECT_TARGET" },
  });
  assert.equal(rejectedActionCode(
    { type: "SELECT_EFFECT_TARGET", playerId: "PLAYER_ONE", targetId: "bad-target" },
    selectionState,
    [],
    "PLAYER_ONE",
  ), "INVALID_TARGET");
  assert.equal(rejectedActionCode(
    { type: "SELECT_EFFECT_TARGET", playerId: "PLAYER_ONE", targetId: "bad-target" },
    gameState(),
    [],
    "PLAYER_ONE",
  ), "INVALID_ACTION");

  const precommitState = gameState({
    targetingState: { active: true, playerId: "PLAYER_ONE", phase: "PRE_COMMIT" },
  });
  assert.equal(rejectedActionCode(
    { type: "CONFIRM_PRECOMMIT_TARGET", playerId: "PLAYER_ONE", targetId: "bad-target" },
    precommitState,
    [],
    "PLAYER_ONE",
  ), "INVALID_TARGET");

  const attack = { type: "ATTACK", playerId: "PLAYER_ONE", attackerInstanceId: "attacker-1", target: { type: "PLAYER", playerId: "PLAYER_TWO" } } as const;
  const otherLegalTarget: GameAction = {
    type: "ATTACK",
    playerId: "PLAYER_ONE",
    attackerInstanceId: "attacker-1",
    target: { type: "WRESTLER", playerId: "PLAYER_TWO", cardInstanceId: "wrestler-2" },
  };
  assert.equal(rejectedActionCode(attack, gameState(), [otherLegalTarget], "PLAYER_ONE"), "INVALID_TARGET");
  assert.equal(rejectedActionCode(attack, gameState(), [], "PLAYER_ONE"), "INVALID_ACTION");
  assert.equal(rejectedActionCode({
    type: "BEGIN_TARGETED_ACTION",
    playerId: "PLAYER_ONE",
    action: { type: "USE_CHAMPION_ABILITY" },
  }, gameState(), [], "PLAYER_ONE"), "INVALID_ACTION");
});