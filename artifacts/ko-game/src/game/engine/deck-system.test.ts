import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import {
  dealOpeningHands,
  endTurn,
  prepareDecks,
  startGame,
} from './turn-system';
import type { ActionResult } from '../actions/types';

function successState(result: ActionResult) {
  assert.equal(result.success, true);
  return result.state;
}

const fixedRandom = () => 0.5;

function getPlayer(
  state: ReturnType<typeof createInitialGameState>,
  playerId: string,
) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assert.ok(player);
  return player;
}

test('각 플레이어는 25장짜리 테스트 덱으로 시작한다', () => {
  const state = createInitialGameState();

  assert.equal(getPlayer(state, 'player-1').deck.length, 25);
  assert.equal(getPlayer(state, 'player-2').deck.length, 25);
});

test('시작 손패는 선공 3장, 후공 4장이다', () => {
  const state = dealOpeningHands(
    prepareDecks(createInitialGameState(), fixedRandom),
  );

  assert.equal(getPlayer(state, 'player-1').hand.length, 3);
  assert.equal(getPlayer(state, 'player-2').hand.length, 4);
});

test('선공은 첫 자기 턴 시작에도 1장을 드로우한다', () => {
  const state = startGame(createInitialGameState(), fixedRandom);

  assert.equal(getPlayer(state, 'player-1').hand.length, 4);
  assert.equal(getPlayer(state, 'player-1').deck.length, 21);
});

test('후공 턴 시작 시 1장을 드로우하고 덱이 1장 감소한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const state = successState(endTurn(started, 'player-1'));

  assert.equal(getPlayer(state, 'player-2').hand.length, 5);
  assert.equal(getPlayer(state, 'player-2').deck.length, 20);
});

test('턴 시작 드로우로 손패는 7장을 넘지 않는다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const fullHandState = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-2'
        ? {
            ...player,
            hand: player.deck.slice(0, 7),
            deck: player.deck.slice(7),
          }
        : player,
    ),
  };
  const state = successState(endTurn(fullHandState, 'player-1'));

  assert.equal(getPlayer(state, 'player-2').hand.length, 7);
  assert.equal(getPlayer(state, 'player-2').removedFromGame.length, 1);
});