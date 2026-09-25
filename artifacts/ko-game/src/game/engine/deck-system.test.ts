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

test('게임 시작 효과는 초기 손패를 나누기 전에 덱의 정확한 카드를 손으로 옮긴다', () => {
  const initial = createInitialGameState();
  const source = initial.players[0]!.deck[0]!;
  initial.players[0]!.deck[0] = {
    ...source,
    abilities: [{
      trigger: 'GAME_START',
      effects: [{
        type: 'STRUCTURED',
        action: 'MOVE_TO_HAND',
        target: { zone: 'DECK', owner: 'SELF', selection: 'SELF', count: 1 },
      }],
    }],
  };
  const shuffled = prepareDecks(initial, () => 0);
  assert.equal(shuffled.players[0]!.deck.slice(0, 4).some((card) => card.instanceId === source.instanceId), false);

  const state = startGame(initial, () => 0);
  const firstPlayer = getPlayer(state, 'player-1');
  assert.equal(firstPlayer.hand.some((card) => card.instanceId === source.instanceId), true);
  assert.equal(firstPlayer.deck.some((card) => card.instanceId === source.instanceId), false);
  assert.equal(firstPlayer.hand.length, 5);
});

test('게임 시작 효과는 덱과 이미 놓인 손패에서 각각 한 번만 발동한다', () => {
  const initial = createInitialGameState();
  const addAttack = (card: typeof initial.players[0]['deck'][number]) => ({
    ...card,
    abilities: [{ trigger: 'GAME_START' as const, effects: [{
      type: 'STRUCTURED' as const,
      action: 'MODIFY_STAT' as const,
      target: { zones: ['DECK' as const, 'HAND' as const], owner: 'SELF' as const, selection: 'SELF' as const, count: 1 },
      values: { stat: 'ATTACK' as const, amount: 2 },
    }] }],
  });
  const deckSource = addAttack(initial.players[0]!.deck[0]!);
  const handSource = { ...addAttack(initial.players[0]!.deck[1]!), instanceId: 'preloaded-hand-card' };
  initial.players[0]!.deck[0] = deckSource;
  initial.players[0]!.hand.push(handSource);
  const started = startGame(initial, fixedRandom);
  const player = getPlayer(started, 'player-1');
  const found = [...player.deck, ...player.hand];
  for (const source of [deckSource, handSource]) {
    const updated = found.find((card) => card.instanceId === source.instanceId);
    assert.ok(updated);
    assert.equal(updated.currentAttack, source.currentAttack + 2);
  }
});

test('AI 전용 옵션은 상대 덱 장수 제한만 완화한다', () => {
  const initial = createInitialGameState();
  initial.players[1]!.deck = initial.players[1]!.deck.slice(0, 3);
  assert.throws(() => startGame(initial, fixedRandom));
  const started = startGame(initial, fixedRandom, undefined, { flexibleDeckPlayerId: 'player-2' });
  assert.equal(started.players[1]!.hand.length, 3);
  const invalidPlayer = createInitialGameState();
  invalidPlayer.players[0]!.deck = invalidPlayer.players[0]!.deck.slice(0, 3);
  assert.throws(() => startGame(invalidPlayer, fixedRandom, undefined, { flexibleDeckPlayerId: 'player-2' }));
});
