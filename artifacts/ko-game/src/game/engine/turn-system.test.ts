import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import { endTurn, startGame } from './turn-system';
import type { ActionResult } from '../actions/types';

function successState(result: ActionResult) {
  assert.equal(result.success, true);
  return result.state;
}

function getPlayerGold(
  state: ReturnType<typeof createInitialGameState>,
  playerId: string,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assert.ok(player);
  return player.currentGold;
}

test('P1 첫 턴은 1G로 시작한다', () => {
  const state = startGame(createInitialGameState());

  assert.equal(state.activePlayerId, 'player-1');
  assert.equal(getPlayerGold(state, 'player-1'), 1);
});

test('P2 첫 턴은 1G로 시작한다', () => {
  const started = startGame(createInitialGameState());
  const state = successState(endTurn(started, 'player-1'));

  assert.equal(state.activePlayerId, 'player-2');
  assert.equal(getPlayerGold(state, 'player-2'), 1);
});

test('P1 두 번째 턴은 2G로 시작한다', () => {
  const started = startGame(createInitialGameState());
  const playerTwoTurn = successState(endTurn(started, 'player-1'));
  const state = successState(endTurn(playerTwoTurn, 'player-2'));

  assert.equal(state.activePlayerId, 'player-1');
  assert.equal(getPlayerGold(state, 'player-1'), 2);
});

test('남은 골드는 다음 개인 턴으로 이월되지 않는다', () => {
  const started = startGame(createInitialGameState());
  const withUnspentGold = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' ? { ...player, currentGold: 7 } : player,
    ),
  };
  const playerTwoTurn = successState(endTurn(withUnspentGold, 'player-1'));
  const state = successState(endTurn(playerTwoTurn, 'player-2'));

  assert.equal(getPlayerGold(state, 'player-1'), 2);
});

test('nextTurnGoldBonus는 적용된 직후 0으로 초기화된다', () => {
  const started = startGame(createInitialGameState());
  const withBonus = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-2'
        ? { ...player, nextTurnGoldBonus: 3 }
        : player,
    ),
  };
  const state = successState(endTurn(withBonus, 'player-1'));
  const playerTwo = state.players.find(
    (player) => player.id === 'player-2',
  );

  assert.ok(playerTwo);
  assert.equal(playerTwo.currentGold, 4);
  assert.equal(playerTwo.nextTurnGoldBonus, 0);
});