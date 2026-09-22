import assert from "node:assert/strict";
import test from "node:test";

import { getLegalActions } from "./engine-actions";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { startGame } from "../engine/turn-system";

test("동일한 immutable GameState의 legal actions는 다시 probe하지 않고 재사용한다", () => {
  const state = startGame(createInitialGameState(), () => 0.5);
  const first = getLegalActions(state, "player-1");
  const second = getLegalActions(state, "player-1");

  assert.ok(first.length > 0);
  assert.strictEqual(second, first);
});