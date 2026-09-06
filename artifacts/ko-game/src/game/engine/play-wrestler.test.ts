import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import { getAdjacentSlots, getLeftAdjacentSlot, getRightAdjacentSlot } from './board-position';
import { playWrestlerFromHand } from './play-wrestler';
import { startGame } from './turn-system';
import type { ActionResult } from '../actions/types';

function successState(result: ActionResult) {
  assert.equal(result.success, true);
  return result.state;
}

const fixedRandom = () => 0.5;

function playableState() {
  const started = startGame(createInitialGameState(), fixedRandom);
  const firstCard = started.players[0].hand[0];

  return {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1'
        ? { ...player, currentGold: firstCard.currentCost }
        : player,
    ),
  };
}

test('손패의 선수를 고정 슬롯에 내고 비용을 지불한다', () => {
  const initial = playableState();
  const card = initial.players[0].hand[0];
  const state = successState(
    playWrestlerFromHand(initial, 'player-1', card.instanceId, 2),
  );
  const player = state.players[0];

  assert.equal(player.currentGold, 0);
  assert.equal(player.hand.some((item) => item.instanceId === card.instanceId), false);
  assert.equal(player.board[2]?.instanceId, card.instanceId);
  assert.equal(player.board[2]?.boardSlot, 2);
  assert.equal(player.board[2]?.enteredThisTurn, true);
  assert.equal(player.board[2]?.attacksUsedThisTurn, 0);
});

test('필드 진입은 ENTER_FIELD 이벤트를 발생시킨다', () => {
  const initial = playableState();
  const card = initial.players[0].hand[0];
  const state = successState(
    playWrestlerFromHand(initial, 'player-1', card.instanceId, 0),
  );

  assert.deepEqual(state.events.at(-1), {
    type: 'ENTER_FIELD',
    playerId: 'player-1',
    cardInstanceId: card.instanceId,
    boardSlot: 0,
    source: { type: 'PLAYER', playerId: 'player-1' },
    target: { type: 'CARD', cardInstanceId: card.instanceId },
    reason: 'ENTER_FIELD',
  });
});

test('골드가 부족하면 선수를 낼 수 없다', () => {
  const initial = playableState();
  const card = initial.players[0].hand[0];
  const noGold = {
    ...initial,
    players: initial.players.map((player) =>
      player.id === 'player-1' ? { ...player, currentGold: 0 } : player,
    ),
  };

  const result = playWrestlerFromHand(
    noGold,
    'player-1',
    card.instanceId,
    0,
  );

  assert.equal(result.success, false);
  assert.equal(result.state, noGold);
  if (!result.success) assert.equal(result.message, '골드가 부족합니다.');
});

test('보드가 가득 차면 선수를 낼 수 없다', () => {
  const initial = playableState();
  const player = initial.players[0];
  const card = player.hand[0];
  const fullBoard = {
    ...initial,
    players: initial.players.map((candidate) =>
      candidate.id === player.id
        ? { ...candidate, board: [card, card, card, card] as typeof candidate.board }
        : candidate,
    ),
  };

  const result = playWrestlerFromHand(
    fullBoard,
    player.id,
    card.instanceId,
    0,
  );

  assert.equal(result.success, false);
  assert.equal(result.state, fullBoard);
  assert.equal(result.state.players[0].hand, fullBoard.players[0].hand);
});

test('보드 인접 위치 helper가 경계를 지킨다', () => {
  assert.equal(getLeftAdjacentSlot(0), null);
  assert.equal(getLeftAdjacentSlot(2), 1);
  assert.equal(getRightAdjacentSlot(3), null);
  assert.equal(getRightAdjacentSlot(2), 3);
  assert.deepEqual(getAdjacentSlots(0), [1]);
  assert.deepEqual(getAdjacentSlots(2), [1, 3]);
});