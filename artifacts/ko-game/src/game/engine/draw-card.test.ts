import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardInstance } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { drawCard } from './draw-card';

function card(index: number): CardInstance {
  return {
    instanceId: `card-${index}`,
    definitionId: `definition-${index}`,
    currentCost: index + 1,
    currentAttack: index + 1,
    currentHealth: index + 2,
    maxHealth: index + 2,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: false,
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
    isSilenced: false,
    isSilenceImmune: false,
    dodgeAvailable: false,
    isStunned: false,
    activeUsedThisTurn: false,
  };
}

function withPlayerOneCards(handSize: number, deckSize: number) {
  const state = createInitialGameState();

  return {
    ...state,
    status: 'IN_PROGRESS' as const,
    players: state.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            hand: Array.from({ length: handSize }, (_, index) => card(index)),
            deck: Array.from(
              { length: deckSize },
              (_, index) => card(handSize + index),
            ),
          }
        : player,
    ),
  };
}

function playerOne(state: ReturnType<typeof createInitialGameState>) {
  const player = state.players.find((candidate) => candidate.id === 'player-1');
  assert.ok(player);
  return player;
}

test('손패가 7장일 때 드로우한 카드는 removedFromGame으로 이동한다', () => {
  const state = drawCard(withPlayerOneCards(7, 1), 'player-1');
  const player = playerOne(state);

  assert.equal(player.hand.length, 7);
  assert.equal(player.deck.length, 0);
  assert.equal(player.removedFromGame.length, 1);
  assert.equal(player.removedFromGame[0].instanceId, 'card-7');
});

test('오버드로우된 카드는 묘지에 들어가지 않는다', () => {
  const state = drawCard(withPlayerOneCards(7, 1), 'player-1');

  assert.equal(playerOne(state).graveyard.length, 0);
});

test('빈 덱 드로우의 피로 피해는 1, 2, 3으로 증가한다', () => {
  const initial = withPlayerOneCards(0, 0);
  const first = drawCard(initial, 'player-1');
  const second = drawCard(first, 'player-1');
  const third = drawCard(second, 'player-1');

  assert.equal(playerOne(first).health, 19);
  assert.equal(playerOne(second).health, 17);
  assert.equal(playerOne(third).health, 14);
  assert.equal(playerOne(third).fatigueCount, 3);
});

test('피로 피해로 체력이 0 이하가 되면 게임이 종료된다', () => {
  const initial = withPlayerOneCards(0, 0);
  const lowHealth = {
    ...initial,
    players: initial.players.map((player) =>
      player.id === 'player-1' ? { ...player, health: 1 } : player,
    ),
  };
  const state = drawCard(lowHealth, 'player-1');

  assert.equal(playerOne(state).health, 0);
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.loserId, 'player-1');
  assert.equal(state.winnerId, 'player-2');
  assert.equal(state.activePlayerId, null);
});