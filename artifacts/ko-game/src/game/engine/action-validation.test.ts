import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { attack } from './combat';
import { createInitialGameState } from './create-initial-game-state';
import { playWrestlerFromHand } from './play-wrestler';
import { endTurn, startGame } from './turn-system';

const fixedRandom = () => 0.5;

function readyWrestler(id: string): CardInstance {
  return {
    instanceId: id,
    definitionId: 'test-wrestler-1',
    currentCost: 1,
    currentAttack: 1,
    currentHealth: 2,
    maxHealth: 2,
    boardSlot: 0,
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
    isDirectDeployedChampion: false,
  };
}

function withAttacker(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            board: [
              readyWrestler('attacker'),
              null,
              null,
              null,
            ] as typeof player.board,
          }
        : player,
    ),
  };
}

test('골드 부족 실패는 원래 게임 상태를 그대로 유지한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const expensiveCard = started.players[0].hand.find(
    (card) => card.currentCost > started.players[0].currentGold,
  );
  assert.ok(expensiveCard);

  const result = playWrestlerFromHand(
    started,
    'player-1',
    expensiveCard.instanceId,
    0,
  );

  assert.equal(result.success, false);
  assert.equal(result.state, started);
  assert.equal(started.players[0].hand.includes(expensiveCard), true);
  assert.equal(started.players[0].currentGold, 1);
});

test('상대 턴 행동은 상태를 변경하지 않는다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const result = endTurn(started, 'player-2');

  assert.equal(result.success, false);
  assert.equal(result.state, started);
  if (!result.success) assert.equal(result.message, '상대의 턴입니다.');
});

test('잘못된 공격 대상은 상태를 변경하지 않는다', () => {
  const started = withAttacker(
    startGame(createInitialGameState(), fixedRandom),
  );
  const result = attack(started, 'player-1', 'attacker', {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: 'missing-target',
  });

  assert.equal(result.success, false);
  assert.equal(result.state, started);
  assert.equal(started.players[0].board[0]?.attacksUsedThisTurn, 0);
  assert.equal(started.players[0].board[0]?.currentHealth, 2);
});