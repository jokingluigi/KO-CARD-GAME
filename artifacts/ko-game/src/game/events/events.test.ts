import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardInstance } from '../cards/types';
import { attack } from '../engine/combat';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { endTurn, startGame } from '../engine/turn-system';

const fixedRandom = () => 0.5;

function successState(
  result: ReturnType<typeof attack> | ReturnType<typeof endTurn>,
) {
  assert.equal(result.success, true);
  return result.state;
}

test('게임 시작과 턴 종료 흐름이 턴, 골드, 드로우 이벤트를 기록한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const eventTypes = started.events.map((event) => event.type);

  assert.equal(eventTypes.includes('TURN_STARTED'), true);
  assert.equal(eventTypes.includes('GOLD_CHANGED'), true);
  assert.equal(eventTypes.includes('CARD_DRAWN'), true);

  const nextTurn = successState(endTurn(started, 'player-1'));
  assert.equal(
    nextTurn.events.some(
      (event) =>
        event.type === 'TURN_ENDED' && event.playerId === 'player-1',
    ),
    true,
  );
});

test('카드 사용은 CARD_PLAYED, GOLD_CHANGED, ENTER_FIELD를 기록한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const affordableCard = started.players[0].hand.find(
    (card) => card.currentCost <= started.players[0].currentGold,
  );
  assert.ok(affordableCard);

  const result = playWrestlerFromHand(
    started,
    'player-1',
    affordableCard.instanceId,
    0,
  );
  assert.equal(result.success, true);
  const types = result.state.events.slice(-4).map((event) => event.type);
  assert.deepEqual(types, [
    'CARD_PLAYED',
    'GOLD_CHANGED',
    'ENTER_FIELD',
    'CHAMPION_QUEST_PROGRESS',
  ]);
});

test('기본 공격은 선언과 피해 이벤트에 source와 target을 기록한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const attacker: CardInstance = {
    ...started.players[0].deck[0],
    instanceId: 'attacker',
    boardSlot: 0,
    enteredThisTurn: false,
    currentAttack: 2,
  };
  const state = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            board: [attacker, null, null, null] as typeof player.board,
          }
        : player,
    ),
  };
  const attacked = successState(
    attack(state, 'player-1', 'attacker', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );
  const declared = attacked.events.find(
    (event) => event.type === 'ATTACK_DECLARED',
  );
  const damaged = attacked.events.find(
    (event) =>
      event.type === 'DAMAGE_DEALT' && event.reason === 'BASIC_ATTACK',
  );

  assert.deepEqual(declared?.source, {
    type: 'CARD',
    cardInstanceId: 'attacker',
  });
  assert.deepEqual(declared?.target, {
    type: 'PLAYER',
    playerId: 'player-2',
  });
  assert.equal(damaged?.amount, 2);
});