import assert from "node:assert/strict";
import test from "node:test";
import { isOnlineActionPayload } from "@workspace/game-engine/online-action";
import { toServerAction } from "./action-parser";
import { classifyOnlineClientMessage, isOnlineClientMessage } from "./client-message-parser";

function matchAction(action: unknown): Record<string, unknown> {
  return {
    type: "MATCH_ACTION",
    matchId: "match-1",
    requestId: "request-1",
    expectedVersion: 0,
    action,
  };
}

test("online ingress accepts supported base actions and targetless Champion ability", () => {
  const basePayloads = [
    { type: "PLAY_WRESTLER", cardInstanceId: "wrestler-1", boardSlot: 0 },
    { type: "PLAY_TECHNIQUE", cardInstanceId: "technique-1" },
    { type: "USE_ACTIVE", cardInstanceId: "wrestler-1" },
    { type: "USE_CHAMPION_ABILITY" },
    {
      type: "ATTACK",
      attackerInstanceId: "wrestler-1",
      target: { type: "WRESTLER", playerId: "PLAYER_TWO", cardInstanceId: "target-1" },
    },
    { type: "END_TURN" },
    { type: "SURRENDER" },
  ];

  for (const action of basePayloads) {
    assert.equal(isOnlineActionPayload(action), true, `${JSON.stringify(action)} should be a valid action`);
    assert.equal(isOnlineClientMessage(matchAction(action)), true);
  }
});

test("online ingress accepts nested targeted actions, cancellation, and target confirmation", () => {
  const targetedActions = [
    { type: "BEGIN_TARGETED_ACTION", action: { type: "PLAY_TECHNIQUE", cardInstanceId: "technique-1" } },
    { type: "BEGIN_TARGETED_ACTION", action: { type: "USE_ACTIVE", cardInstanceId: "wrestler-1" } },
    { type: "BEGIN_TARGETED_ACTION", action: { type: "USE_CHAMPION_ABILITY" } },
    { type: "CANCEL_EFFECT_TARGET" },
    { type: "CONFIRM_PRECOMMIT_TARGET", targetId: "target-1" },
    { type: "SELECT_EFFECT_TARGET", targetId: "target-1" },
  ];

  for (const action of targetedActions) {
    assert.equal(isOnlineActionPayload(action), true, `${JSON.stringify(action)} should be a valid action`);
    assert.equal(isOnlineClientMessage(matchAction(action)), true);
  }
});

test("online ingress safely rejects malformed and unknown nested payloads", () => {
  const invalidActions = [
    { type: "BEGIN_TARGETED_ACTION" },
    { type: "BEGIN_TARGETED_ACTION", action: null },
    { type: "BEGIN_TARGETED_ACTION", action: { type: "UNKNOWN_ACTION" } },
    { type: "BEGIN_TARGETED_ACTION", action: { type: "USE_CHAMPION_ABILITY", playerId: "spoofed" } },
    { type: "BEGIN_TARGETED_ACTION", action: { type: "USE_ACTIVE", cardInstanceId: "active-1", extra: true } },
    { type: "CONFIRM_PRECOMMIT_TARGET" },
    { type: "CANCEL_EFFECT_TARGET", targetId: "unexpected" },
    {
      type: "ATTACK",
      attackerInstanceId: "attacker-1",
      target: { type: "PLAYER", playerId: "PLAYER_TWO", cardInstanceId: "unexpected" },
    },
    { type: "NOT_A_GAME_ACTION" },
  ];

  for (const action of invalidActions) {
    assert.equal(isOnlineActionPayload(action), false, `${JSON.stringify(action)} should be rejected`);
    assert.equal(isOnlineClientMessage(matchAction(action)), false);
  }
  assert.equal(isOnlineClientMessage({ ...matchAction({ type: "END_TURN" }), expectedVersion: -1 }), false);
});

test("client ingress distinguishes malformed actions, malformed known messages, and unknown types", () => {
  assert.deepEqual(classifyOnlineClientMessage(matchAction({ type: "BEGIN_TARGETED_ACTION" })), {
    kind: "INVALID_ACTION",
    code: "INVALID_ACTION",
    message: "액션 형식이 올바르지 않습니다.",
  });
  assert.deepEqual(classifyOnlineClientMessage({ type: "SUBSCRIBE" }), {
    kind: "INVALID_MESSAGE",
    code: "INVALID_MESSAGE",
    message: "요청 메시지 형식이 올바르지 않습니다.",
  });
  assert.deepEqual(classifyOnlineClientMessage({ type: "UNRECOGNIZED_MESSAGE" }), {
    kind: "UNKNOWN_MESSAGE",
    code: "INVALID_MESSAGE",
    message: "알 수 없는 메시지입니다.",
  });
  assert.deepEqual(classifyOnlineClientMessage({ matchId: "match-1" }), {
    kind: "INVALID_MESSAGE",
    code: "INVALID_MESSAGE",
    message: "요청 메시지 형식이 올바르지 않습니다.",
  });
});

test("action parser translates supported payloads and rejects malformed or unknown actions", () => {
  assert.deepEqual(toServerAction(
    { type: "BEGIN_TARGETED_ACTION", action: { type: "USE_CHAMPION_ABILITY" } },
    "PLAYER_ONE",
  ), {
    type: "BEGIN_TARGETED_ACTION",
    playerId: "PLAYER_ONE",
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.deepEqual(toServerAction(
    { type: "CONFIRM_PRECOMMIT_TARGET", targetId: "target-1" },
    "PLAYER_ONE",
  ), { type: "CONFIRM_PRECOMMIT_TARGET", playerId: "PLAYER_ONE", targetId: "target-1" });
  assert.deepEqual(toServerAction(
    { type: "CANCEL_EFFECT_TARGET" },
    "PLAYER_ONE",
  ), { type: "CANCEL_EFFECT_TARGET", playerId: "PLAYER_ONE" });
  assert.deepEqual(toServerAction(
    { type: "USE_CHAMPION_ABILITY" },
    "PLAYER_ONE",
  ), { type: "USE_CHAMPION_ABILITY", playerId: "PLAYER_ONE" });

  assert.equal(toServerAction({ type: "BEGIN_TARGETED_ACTION", action: { type: "UNKNOWN_ACTION" } }, "PLAYER_ONE"), null);
  assert.equal(toServerAction({ type: "BEGIN_TARGETED_ACTION", action: { type: "USE_ACTIVE" } }, "PLAYER_ONE"), null);
  assert.equal(toServerAction({ type: "FUTURE_ACTION" }, "PLAYER_ONE"), null);
  assert.equal(toServerAction(null, "PLAYER_ONE"), null);
});