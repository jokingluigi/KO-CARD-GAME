import assert from "node:assert/strict";
import test from "node:test";

import { createAiMatchOpening, isAiMatchOpeningActive, MATCH_OPENING_DURATION_MS } from "./ai-match-opening";

const playerChampion = { name: "Player champion", imageUrl: "/player.png", introLineOne: "First!" };
const aiChampion = { name: "AI champion", imageUrl: "/ai.png", introLineOne: "Second!" };

test("AI opening uses the actual match, account, deck and champion details without changing game state", () => {
  const state = Object.freeze({ gameId: "ai-one", turn: 1, activePlayerId: "ai", hand: [1, 2, 3] });
  const opening = createAiMatchOpening(
    state.gameId, "Player nickname", "AI deck name", playerChampion, aiChampion, 1000,
  );
  assert.equal(opening.self.displayName, "Player nickname");
  assert.equal(opening.opponent.displayName, "AI deck name");
  assert.equal(opening.self.championName, playerChampion.name);
  assert.equal(opening.opponent.championName, aiChampion.name);
  assert.equal(opening.self.portraitUrl, playerChampion.imageUrl);
  assert.equal(opening.opponent.portraitUrl, aiChampion.imageUrl);
  assert.equal(opening.firstSpeaker, "self");
  assert.equal(opening.gameplayStartsAt, 1000 + MATCH_OPENING_DURATION_MS);
  assert.deepEqual(state, { gameId: "ai-one", turn: 1, activePlayerId: "ai", hand: [1, 2, 3] });
});

test("the opening deadline applies equally to AI-first and player-first matches, even when skipped", () => {
  for (const activePlayerId of ["player-1", "player-2"]) {
    const state = Object.freeze({ gameId: `ai-${activePlayerId}`, activePlayerId, turn: 1 });
    const opening = createAiMatchOpening(state.gameId, "P", "AI", playerChampion, aiChampion, 1000);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, 1000), true);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt - 1), true);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt), false);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt + 1), false);
    // Skip hides the animation but has no bearing on the readiness deadline.
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, 2000), true);
    assert.equal(state.activePlayerId, activePlayerId);
    assert.equal(state.turn, 1);
  }
});

test("a fresh AI match gets its own opening, while rerenders of the old match cannot replay it", () => {
  const oldOpening = createAiMatchOpening("ai-one", "P", "AI 1", playerChampion, aiChampion, 1000);
  const newOpening = createAiMatchOpening("ai-two", "P", "AI 2", playerChampion, aiChampion, 9000);
  assert.equal(isAiMatchOpeningActive(oldOpening, "ai-one", 9000), false);
  assert.equal(isAiMatchOpeningActive(oldOpening, "ai-two", 2000), false);
  assert.equal(isAiMatchOpeningActive(newOpening, "ai-two", 9000), true);
});

test("speaker falls back to the AI only when the player has no intro line", () => {
  const opening = createAiMatchOpening(
    "ai-one", "P", "AI", { ...playerChampion, introLineOne: null }, aiChampion, 1000,
  );
  assert.equal(opening.firstSpeaker, "opponent");
  assert.equal(opening.self.dialogueLine, null);
});