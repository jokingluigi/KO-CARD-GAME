import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGameState, startGame } from "@workspace/game-engine";
import { replayAIMatch } from "./ai-match-quest-service";

function startedEmptyMatch() {
  return startGame(createInitialGameState());
}

test("AI match replay binds surrender to the authenticated player, not client playerId", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(
    state,
    [{ type: "SURRENDER", playerId: aiPlayerId }],
    userPlayerId,
    aiPlayerId,
  );

  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.winnerId, aiPlayerId);
  assert.equal(finished.loserId, userPlayerId);
});

test("AI match replay advances the server-controlled opponent between user actions", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(
    state,
    [
      { type: "END_TURN", playerId: userPlayerId },
      { type: "END_TURN", playerId: userPlayerId },
      { type: "SURRENDER", playerId: userPlayerId },
    ],
    userPlayerId,
    aiPlayerId,
  );

  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.winnerId, aiPlayerId);
});

test("AI match replay rejects an incomplete or illegal client action transcript", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;

  assert.throws(
    () => replayAIMatch(state, [], userPlayerId, aiPlayerId),
    /완료된 AI 경기/,
  );
  assert.throws(
    () => replayAIMatch(
      state,
      [{ type: "PLAY_WRESTLER", cardInstanceId: "not-in-hand", boardSlot: 0 }],
      userPlayerId,
      aiPlayerId,
    ),
  );
});