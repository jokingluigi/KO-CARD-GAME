import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardInstance } from '../cards/types';
import type { ActionResult } from '../actions/types';
import { createInitialGameState } from './create-initial-game-state';
import { attack } from './combat';
import { endTurn, startGame } from './turn-system';

const fixedRandom = () => 0.5;

function successState(result: ActionResult) {
  assert.equal(result.success, true);
  return result.state;
}

function wrestler(
  id: string,
  attackValue: number,
  health: number,
  enteredThisTurn = false,
): CardInstance {
  return {
    instanceId: id,
    definitionId: 'test-wrestler-1',
    currentCost: 1,
    currentAttack: attackValue,
    currentHealth: health,
    maxHealth: health,
    boardSlot: null,
    enteredThisTurn,
    attacksUsedThisTurn: 0,
  };
}

function combatState(
  playerOneCards: CardInstance[],
  playerTwoCards: CardInstance[] = [],
) {
  const started = startGame(createInitialGameState(), fixedRandom);

  return {
    ...started,
    players: started.players.map((player) => ({
      ...player,
      board: Array.from({ length: 4 }, (_, index) => {
        const card =
          player.id === 'player-1'
            ? playerOneCards[index]
            : playerTwoCards[index];
        return card ? { ...card, boardSlot: index as 0 | 1 | 2 | 3 } : null;
      }) as typeof player.board,
    })),
  };
}

test('각 선수는 자기 턴에 한 번만 공격할 수 있다', () => {
  const initial = combatState([wrestler('a', 1, 2)]);
  const attacked = successState(
    attack(initial, 'player-1', 'a', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );

  assert.equal(attacked.players[0].board[0]?.attacksUsedThisTurn, 1);
  const result = attack(attacked, 'player-1', 'a', {
    type: 'PLAYER',
    playerId: 'player-2',
  });
  assert.equal(result.success, false);
  assert.equal(result.state, attacked);
});

test('서로 다른 선수는 각각 한 번씩 공격할 수 있다', () => {
  const initial = combatState([
    wrestler('a', 1, 2),
    wrestler('b', 1, 2),
  ]);
  const first = successState(
    attack(initial, 'player-1', 'a', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );
  const second = successState(
    attack(first, 'player-1', 'b', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );

  assert.equal(second.players[0].board[0]?.attacksUsedThisTurn, 1);
  assert.equal(second.players[0].board[1]?.attacksUsedThisTurn, 1);
});

test('소환된 턴에는 공격할 수 없다', () => {
  const initial = combatState([wrestler('a', 1, 2, true)]);

  const result = attack(initial, 'player-1', 'a', {
    type: 'PLAYER',
    playerId: 'player-2',
  });
  assert.equal(result.success, false);
  assert.equal(result.state, initial);
  if (!result.success) {
    assert.equal(result.message, '이 선수는 이번 턴에 공격할 수 없습니다.');
  }
});

test('다음 자기 턴 시작 시 공격 가능 상태가 된다', () => {
  const initial = combatState([wrestler('a', 1, 2, true)]);
  const playerTwoTurn = successState(endTurn(initial, 'player-1'));
  const playerOneTurn = successState(endTurn(playerTwoTurn, 'player-2'));
  const state = successState(
    attack(playerOneTurn, 'player-1', 'a', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );

  assert.equal(state.players[0].board[0]?.attacksUsedThisTurn, 1);
});

test('선수 전투는 서로 동시에 피해를 준다', () => {
  const initial = combatState(
    [wrestler('attacker', 4, 5)],
    [wrestler('defender', 3, 6)],
  );
  const state = successState(
    attack(initial, 'player-1', 'attacker', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'defender',
    }),
  );

  assert.equal(state.players[0].board[0]?.currentHealth, 2);
  assert.equal(state.players[1].board[0]?.currentHealth, 2);
});

test('체력이 0 이하인 선수는 RETIRE되고 묘지로 이동한다', () => {
  const initial = combatState(
    [wrestler('attacker', 4, 3)],
    [wrestler('defender', 3, 4)],
  );
  const state = successState(
    attack(initial, 'player-1', 'attacker', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'defender',
    }),
  );

  assert.equal(state.players[0].board[0], null);
  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[0].graveyard[0].instanceId, 'attacker');
  assert.equal(state.players[1].graveyard[0].instanceId, 'defender');
  assert.equal(state.events.at(-1)?.type, 'RETIRE');
  assert.equal(state.events.some((event) => event.type === 'DESTROY'), false);
});

test('선수는 상대 플레이어 본체를 공격할 수 있다', () => {
  const initial = combatState([wrestler('a', 4, 5)]);
  const state = successState(
    attack(initial, 'player-1', 'a', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );

  assert.equal(state.players[1].health, 16);
});

test('본체 체력이 0 이하가 되면 승패가 결정된다', () => {
  const initial = combatState([wrestler('a', 20, 5)]);
  const state = successState(
    attack(initial, 'player-1', 'a', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );

  assert.equal(state.status, 'FINISHED');
  assert.equal(state.winnerId, 'player-1');
  assert.equal(state.loserId, 'player-2');
  assert.equal(state.activePlayerId, null);
});