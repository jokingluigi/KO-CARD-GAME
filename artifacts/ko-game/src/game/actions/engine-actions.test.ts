import assert from "node:assert/strict";
import test from "node:test";

import { executeAction, getLegalActions } from "./engine-actions";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { startGame } from "../engine/turn-system";

test("같은 턴에 챔피언 감정표현을 세 번 이상 사용할 수 있다", () => {
  let state = startGame(createInitialGameState(), () => 0.5);
  const playerId = state.players[0]!.id;
  for (let count = 0; count < 4; count += 1) {
    const result = executeAction(state, { type: "EMOTE", playerId, emote: "HELLO" });
    assert.equal(result.success, true);
    state = result.state;
  }
  assert.equal(state.events.filter((event) => event.type === "CHAMPION_EMOTE" && event.playerId === playerId).length, 4);
});

test("동일한 immutable GameState의 legal actions는 다시 probe하지 않고 재사용한다", () => {
  const state = startGame(createInitialGameState(), () => 0.5);
  const first = getLegalActions(state, "player-1");
  const second = getLegalActions(state, "player-1");

  assert.ok(first.length > 0);
  assert.strictEqual(second, first);
});

test("도발이 있으면 공격 미리보기 대상도 도발 선수로만 제한된다", () => {
  const started = startGame(createInitialGameState(), () => 0.5);
  const attacker = { ...started.players[0]!.deck[0]!, instanceId: 'attacker', enteredThisTurn: false, attacksUsedThisTurn: 0, boardSlot: 0 as const };
  const taunt = { ...started.players[1]!.deck[0]!, instanceId: 'taunt', keywords: ['TAUNT' as const], boardSlot: 0 as const };
  const other = { ...started.players[1]!.deck[1]!, instanceId: 'other', keywords: [], boardSlot: 1 as const };
  const state = {
    ...started,
    players: [
      { ...started.players[0]!, board: [attacker, null, null, null] as typeof started.players[0]['board'] },
      { ...started.players[1]!, board: [taunt, other, null, null] as typeof started.players[1]['board'] },
    ],
  };
  const targets = getLegalActions(state, state.players[0]!.id)
    .filter((action) => action.type === 'ATTACK')
    .map((action) => action.type === 'ATTACK' ? action.target : null);
  assert.deepEqual(targets, [{ type: 'WRESTLER', playerId: state.players[1]!.id, cardInstanceId: 'taunt' }]);
});
