import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardInstance } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { startGame } from './turn-system';
import { resolveStateBasedDeaths } from '../effects/effect-engine';

// 2026-11-26 대표 결정 B2: 동시에 쓰러지면 턴 주인 쪽 먼저, 같은 편은 왼쪽 칸부터.
function dead(id: string): CardInstance {
  return {
    instanceId: id, definitionId: 'test-wrestler-1', currentCost: 1, currentAttack: 1, currentHealth: 0, maxHealth: 2,
    boardSlot: null, enteredThisTurn: false, attacksUsedThisTurn: 0, isGenerated: false, isToken: false, isChampionToken: false,
    keywords: [], abilities: [], isSilenced: false, isSilenceImmune: false, dodgeAvailable: false, isStunned: false,
    activeUsedThisTurn: false, isDirectDeployedChampion: false,
  };
}

function boardWith(active: string, one: (CardInstance | null)[], two: (CardInstance | null)[]) {
  const started = startGame(createInitialGameState(), () => 0.5);
  return {
    ...started,
    activePlayerId: active,
    players: started.players.map((player) => ({
      ...player,
      board: [0, 1, 2, 3].map((slot) => {
        const card = (player.id === 'player-1' ? one : two)[slot];
        return card ? { ...card, boardSlot: slot as 0 | 1 | 2 | 3 } : null;
      }) as typeof player.board,
    })),
  };
}

function retiredOrder(state: ReturnType<typeof boardWith>) {
  const before = state.events.length;
  return resolveStateBasedDeaths(state).events.slice(before).filter((event) => event.type === 'CARD_RETIRED').map((event) => event.cardInstanceId);
}

test('simultaneous deaths: the turn owner side retires first, then left to right', () => {
  const one = [null, dead('p1-b'), null, dead('p1-d')];
  const two = [dead('p2-a'), null, dead('p2-c'), null];
  assert.deepEqual(retiredOrder(boardWith('player-2', one, two)), ['p2-a', 'p2-c', 'p1-b', 'p1-d']);
  assert.deepEqual(retiredOrder(boardWith('player-1', one, two)), ['p1-b', 'p1-d', 'p2-a', 'p2-c']);
});
