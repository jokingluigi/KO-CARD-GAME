import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGameState, startGame, executeAction, type GameAction } from "@workspace/game-engine";
import { runAITurn } from "../../../ko-game/src/game/actions/ai-turn-scheduler";
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

test("AI match replay keeps player emotes in the action transcript", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(state, [
    { type: "EMOTE", emote: "HELLO", playerId: userPlayerId },
    { type: "SURRENDER", playerId: userPlayerId },
  ], userPlayerId, aiPlayerId);
  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.events.some((event) => event.type === "CHAMPION_EMOTE" && event.playerId === userPlayerId), true);
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

test("AI match reward replay follows the AI actions actually shown to the player", async () => {
  const started = startedEmptyMatch();
  const userId = started.players[0]!.id;
  const aiId = started.players[1]!.id;
  const ended = executeAction(started, { type: "END_TURN", playerId: userId });
  assert.equal(ended.success, true);
  const transcript: Array<GameAction & { actor?: "AI" }> = [{ type: "END_TURN", playerId: userId }];
  const afterAI = await runAITurn(ended.state, aiId, {
    wait: async () => {}, waitForPresentationIdle: async () => {}, isCancelled: () => false,
    actionDelayMs: 0,
    onState: () => {}, onAction: (action) => { transcript.push({ ...action, actor: "AI" }); },
  });
  assert.equal(afterAI.activePlayerId, userId);
  transcript.push({ type: "SURRENDER", playerId: userId });
  const result = replayAIMatch(started, transcript, userId, aiId);
  assert.equal(result.winnerId, aiId);
  assert.equal(result.status, "FINISHED");
});
